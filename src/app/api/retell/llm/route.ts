import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { retellHttpLlmJson, retellLlmPostBodySchema, runRetellLlmHttp } from "@/lib/retell-llm-ws/retell-llm-http-core";
import {
  applyRetellHeuristics,
  buildKaragkounisTransferSystemPrompt,
  RETELL_DECLINE_LINE,
  RETELL_OPENING_LINE,
  RETELL_SONNET_MODEL,
  transcriptToMessages,
} from "@/lib/retell-llm";
import { nextJsonError } from "@/lib/api-resilience";

/**
 * Custom LLM over **HTTP** (JSON or SSE) for Vercel / serverless.
 *
 * **Retell’s custom LLM (live) uses WebSocket**, not this route — see
 * [LLM WebSocket](https://docs.retellai.com/api-references/llm-websocket) and `npm run dev:retell-llm-ws` + `server.ts`.
 * There is **no official HTTP “polling” mode** in the public docs; use **WebSocket** or the built-in **Retell LLM** in the dashboard.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LLM_TIMEOUT_MS = 8_000;

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const RETELL_LLM_DASHBOARD_HINT = `Είσαι ο βοηθός του γραφείου του βουλευτή Κωνσταντίνου Καραγκούνη. Μόλις απαντήσει ο πολίτης, πες: 'Καλησπέρα σας, σας καλώ από το γραφείο του βουλευτή κ. Καραγκούνη. Θέλετε να σας τον συνδέσω;' Αν πει ΝΑΙ: transfer_call. Αν πει ΟΧΙ: 'Εντάξει, καλή συνέχεια!' και end_call. Μην πεις τίποτα άλλο.`;

function wantsSse(request: NextRequest) {
  const a = request.headers.get("accept") ?? "";
  return a.includes("text/event-stream") || request.nextUrl.searchParams.get("stream") === "1";
}

function encodeSse(obj: object) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseFromSingleJson(status: number, body: object) {
  return new Response(encodeSse(body), { status, headers: SSE_HEADERS });
}

export async function POST(request: NextRequest) {
  const useSse = wantsSse(request);
  console.log("[api/retell/llm] POST", { sse: useSse });
  try {
    const text = await request.text();
    let raw: Record<string, unknown> = {};
    try {
      raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      if (useSse) {
        return sseFromSingleJson(400, { error: "Άκυρο JSON" });
      }
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!useSse) {
      const out = await runRetellLlmHttp(raw);
      return NextResponse.json(out.body, { status: out.status });
    }

    const parsed = retellLlmPostBodySchema.safeParse(raw);
    if (!parsed.success) {
      return sseFromSingleJson(400, { error: "Άκυρα δεδομένα" });
    }

    const it = parsed.data.interaction_type?.trim() ?? "";
    if (it !== "response_required") {
      const out = await runRetellLlmHttp(raw);
      if ("error" in out.body) {
        return new Response(encodeSse(out.body), { status: out.status, headers: SSE_HEADERS });
      }
      return new Response(encodeSse(out.body), { status: out.status, headers: SSE_HEADERS });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return new Response(encodeSse({ error: "Λείπει η ANTHROPIC_API_KEY" }), { status: 503, headers: SSE_HEADERS });
    }
    const rid = typeof parsed.data.response_id === "number" ? parsed.data.response_id : 1;
    const transcript = parsed.data.transcript ?? [];
    const msgs = transcriptToMessages(
      transcript.map((t) => ({ role: t.role, content: t.content == null ? "" : String(t.content) })),
    );
    if (msgs.length === 0) {
      return new Response(
        encodeSse(retellHttpLlmJson(rid, RETELL_OPENING_LINE, false)),
        { status: 200, headers: SSE_HEADERS },
      );
    }
    const system = buildKaragkounisTransferSystemPrompt();
    const client = new Anthropic({ apiKey: key });

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const write = (o: object) => controller.enqueue(enc.encode(encodeSse(o)));
        const timeout = new Promise<"t">((r) => setTimeout(() => r("t"), LLM_TIMEOUT_MS));
        try {
          const created = client.messages.create({
            model: RETELL_SONNET_MODEL,
            max_tokens: 200,
            system,
            messages: msgs,
            stream: true,
          });
          const claudeStream = (await Promise.race([created, timeout])) as Awaited<typeof created> | "t";
          if (claudeStream === "t") {
            write(retellHttpLlmJson(rid, RETELL_DECLINE_LINE, true));
            return;
          }
          let full = "";
          for await (const ev of claudeStream) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              const d = ev.delta.text;
              full += d;
              write({
                response_id: rid,
                content: d,
                content_complete: false,
                end_call: false,
              } as const);
            }
          }
          const spoken = full.trim();
          if (!spoken) {
            write(retellHttpLlmJson(rid, RETELL_DECLINE_LINE, true));
            return;
          }
          const h = applyRetellHeuristics(spoken);
          if (h.transfer_call) {
            const o = retellHttpLlmJson(rid, spoken, false, { transfer_call: true });
            write({ ...o, content_complete: true, end_call: false });
            return;
          }
          write({
            response_id: rid,
            content: "",
            content_complete: true,
            end_call: h.end_call,
          } as const);
        } catch (e) {
          console.error("[api/retell/llm] SSE stream", e);
          write({ error: "stream_error" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  } catch (e) {
    console.error("[api/retell/llm]", e);
    return nextJsonError();
  }
}

export function GET() {
  return Response.json(
    {
      message:
        "Custom LLM (live) uses WebSocket. For Vercel, use this POST (JSON or SSE) for tests, or use Retell LLM + Greek prompt in the agent.",
      retellLlmDashboardHint: RETELL_LLM_DASHBOARD_HINT,
      retellLlmWebsocketDocs: "https://docs.retellai.com/api-references/llm-websocket",
      customServer: "npm run dev:retell-llm-ws — see server.ts in repo root",
    },
    { status: 200 },
  );
}
