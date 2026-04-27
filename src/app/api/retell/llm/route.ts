import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  applyRetellHeuristics,
  buildGreekPoliticalOfficeSystemPrompt,
  getFirstName,
  mergeCallMetadata,
  RETELL_SONNET_MODEL,
  transcriptToMessages,
} from "@/lib/retell-llm";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LLM_TIMEOUT_MS = 8_000;

const bodySchema = z
  .object({
    response_id: z.number().int().optional(),
    call_id: z.string().optional(),
    agent_id: z.string().optional(),
    interaction_type: z.string().optional(),
    call: z
      .object({
        call_id: z.string().optional(),
        call_status: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional().nullable(),
        retell_llm_dynamic_variables: z.record(z.string(), z.string()).optional().nullable(),
      })
      .optional()
      .nullable(),
    transcript: z
      .array(
        z.object({
          role: z.string(),
          content: z.string().optional().nullable(),
        }),
      )
      .optional(),
  })
  .passthrough();

/** Retell: base fields; add `transfer_call` only when transferring. */
function retellLlmJson(
  responseId: number | undefined,
  content: string,
  end_call: boolean,
  extra?: { transfer_call?: true },
) {
  const response_id = typeof responseId === "number" && Number.isFinite(responseId) ? responseId : 1;
  const o: {
    response_id: number;
    content: string;
    content_complete: true;
    end_call: boolean;
    transfer_call?: true;
  } = {
    response_id,
    content,
    content_complete: true,
    end_call,
  };
  if (extra?.transfer_call) o.transfer_call = true;
  return o;
}

function isCallInit(s: string | undefined) {
  if (!s) return false;
  return s === "call_initated" || s === "call_initiated" || s === "call_init" || s === "initiated";
}

/** `first_name` from request only (no DB) — root + call metadata / dynamic variables. */
function firstNameFromRequestBody(raw: Record<string, unknown>, call: z.infer<typeof bodySchema>["call"]) {
  const top = raw.first_name;
  if (typeof top === "string" && top.trim()) return top.trim();
  const meta = mergeCallMetadata(
    call as { metadata?: Record<string, unknown> | null; retell_llm_dynamic_variables?: Record<string, string> | null } | null,
  ) as Record<string, string | undefined | null>;
  return getFirstName(meta);
}

export async function POST(request: Request) {
  console.log("[api/retell/llm] POST handler invoked");
  try {
    const text = await request.text();
    console.log("[api/retell/llm] request body (raw):", text);

    let raw: unknown = {};
    try {
      raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: "Άκυρο JSON" }, { status: 400 });
    }

    const rawObj = raw as Record<string, unknown>;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα αιτήματος Retell LLM" }, { status: 400 });
    }
    const body = parsed.data;
    const it = body.interaction_type?.trim() ?? "";
    const rid = body.response_id;
    const call = body.call ?? null;

    if (it === "reminder_required" || it === "reminder") {
      return NextResponse.json(
        retellLlmJson(rid, "Είστε ακόμα εκεί;", false),
      );
    }

    if (isCallInit(it)) {
      const nameForGreet = firstNameFromRequestBody(rawObj, call);
      const opening = `Καλημέρα ${nameForGreet}! Καλώ από το πολιτικό γραφείο του Κώστα Καραγκούνη.`;
      return NextResponse.json(retellLlmJson(rid, opening, false));
    }

    if (it === "response_required") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        return NextResponse.json(
          { error: "Λείπει η ANTHROPIC_API_KEY· δεν μπορεί ο βοηθός να απαντήσει" },
          { status: 503 },
        );
      }
      const meta = mergeCallMetadata(call) as Record<string, string | undefined | null>;
      const first = getFirstName(meta);

      const transcript = body.transcript ?? [];
      const msgs = transcriptToMessages(
        transcript.map((t) => ({ role: t.role, content: t.content == null ? "" : String(t.content) })),
      );
      if (msgs.length === 0) {
        return NextResponse.json(
          retellLlmJson(
            rid,
            "Χρόνια πολλά! Να είστε καλά, και μη διστάσετε να επικοινωνήσετε με το γραφείο μας.",
            true,
          ),
        );
      }
      const system = buildGreekPoliticalOfficeSystemPrompt(first);
      const client = new Anthropic({ apiKey: key });
      const claudePromise = client.messages.create({
        model: RETELL_SONNET_MODEL,
        max_tokens: 400,
        system,
        messages: msgs,
      });
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), LLM_TIMEOUT_MS);
      });
      const result = await Promise.race([claudePromise, timeoutPromise]);
      if (result === "timeout") {
        return NextResponse.json(
          retellLlmJson(
            rid,
            "Συγνώμη, υπήρξε μικρή καθυστέρηση. Ξαναλέτε, σας παρακαλώ, τι χρειάζεστε;",
            false,
          ),
        );
      }
      const claudeRes = result;
      const textBlock = claudeRes.content[0];
      if (!textBlock || textBlock.type !== "text") {
        return NextResponse.json(
          retellLlmJson(rid, "Χρόνια πολλά! Να είστε καλά.", true),
        );
      }
      const spoken = textBlock.text.trim();
      const h = applyRetellHeuristics(spoken);
      if (h.transfer_call) {
        return NextResponse.json(
          retellLlmJson(rid, spoken, false, { transfer_call: true }),
        );
      }
      let endCall = h.end_call;
      if (!h.end_call) {
        const lo = spoken.toLowerCase();
        if (lo.includes("χρόνια πολλά") && !spoken.includes("?")) {
          endCall = true;
        }
      }
      return NextResponse.json(retellLlmJson(rid, spoken, endCall));
    }

    return NextResponse.json(
      {
        error: `Άγνωστο interaction_type: ${it || "—"}. Αναμενόμενα: call_initated, response_required, reminder_required`,
      },
      { status: 400 },
    );
  } catch (e) {
    console.error("[api/retell/llm]", e);
    return nextJsonError();
  }
}
