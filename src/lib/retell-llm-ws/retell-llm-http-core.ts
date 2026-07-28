import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  applyRetellHeuristics,
  buildKaragkounisTransferSystemPrompt,
  RETELL_DECLINE_LINE,
  RETELL_OPENING_LINE,
  RETELL_SONNET_MODEL,
  transcriptToMessages,
} from "@/lib/retell-llm";

const LLM_TIMEOUT_MS = 8_000;

export const retellLlmPostBodySchema = z
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

export type RetellHttpLlmResponse = {
  response_id: number;
  content: string;
  content_complete: true;
  end_call: boolean;
  transfer_call?: true;
};

export function retellHttpLlmJson(
  responseId: number | undefined,
  content: string,
  end_call: boolean,
  extra?: { transfer_call?: true },
): RetellHttpLlmResponse {
  const response_id = typeof responseId === "number" && Number.isFinite(responseId) ? responseId : 1;
  const o: RetellHttpLlmResponse = {
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

/**
 * Stateless HTTP / SSE handler for the same JSON body Retell’s examples use in demos.
 * Official **live** custom LLM integration uses **WebSocket** (see `server.ts` + `npm run dev:retell-llm-ws`).
 * @see https://docs.retellai.com/api-references/llm-websocket
 */
export async function runRetellLlmHttp(
  raw: Record<string, unknown>,
): Promise<
  { status: number; body: RetellHttpLlmResponse } | { status: number; body: { error: string } }
> {
  const parsed = retellLlmPostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: { error: "Άκυρα δεδομένα αιτήματος Retell LLM" } };
  }
  const body = parsed.data;
  const it = body.interaction_type?.trim() ?? "";
  const rid = body.response_id;

  if (it === "reminder_required" || it === "reminder") {
    return { status: 200, body: retellHttpLlmJson(rid, "Είστε ακόμα εκεί;", false) };
  }

  if (isCallInit(it)) {
    return { status: 200, body: retellHttpLlmJson(rid, RETELL_OPENING_LINE, false) };
  }

  if (it === "response_required") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { status: 503, body: { error: "Λείπει η ANTHROPIC_API_KEY" } };
    }
    const transcript = body.transcript ?? [];
    const msgs = transcriptToMessages(
      transcript.map((t) => ({ role: t.role, content: t.content == null ? "" : String(t.content) })),
    );
    if (msgs.length === 0) {
      return {
        status: 200,
        body: retellHttpLlmJson(rid, RETELL_OPENING_LINE, false),
      };
    }
    const system = buildKaragkounisTransferSystemPrompt();
    const client = new Anthropic({ apiKey: key });
    const claudePromise = client.messages.create({
      model: RETELL_SONNET_MODEL,
      max_tokens: 200,
      system,
      messages: msgs,
    });
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), LLM_TIMEOUT_MS);
    });
    const result = await Promise.race([claudePromise, timeoutPromise]);
    if (result === "timeout") {
      return {
        status: 200,
        body: retellHttpLlmJson(rid, RETELL_DECLINE_LINE, true),
      };
    }
    const claudeRes = result;
    const textBlock = claudeRes.content[0];
    if (!textBlock || textBlock.type !== "text") {
      return { status: 200, body: retellHttpLlmJson(rid, RETELL_DECLINE_LINE, true) };
    }
    const spoken = textBlock.text.trim();
    const h = applyRetellHeuristics(spoken);
    if (h.transfer_call) {
      return { status: 200, body: retellHttpLlmJson(rid, spoken, false, { transfer_call: true }) };
    }
    return { status: 200, body: retellHttpLlmJson(rid, spoken, h.end_call) };
  }

  return {
    status: 400,
    body: {
      error: `Άγνωστο interaction_type: ${it || "—"}. Αναμενόμενα: call_initated, response_required, reminder_required`,
    },
  };
}
