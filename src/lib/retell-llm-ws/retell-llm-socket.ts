import type { WebSocket } from "ws";
import Anthropic from "@anthropic-ai/sdk";
import {
  applyRetellHeuristics,
  buildGreekPoliticalOfficeSystemPrompt,
  getFirstName,
  mergeCallMetadata,
  RETELL_SONNET_MODEL,
  transcriptToMessages,
} from "@/lib/retell-llm";
import { z } from "zod";

const LLM_TIMEOUT_MS = 8_000;

/** Inbound (Retell -> us) for loose parsing */
const retellIncomingSchema = z
  .object({
    response_id: z.number().int().optional(),
    interaction_type: z.string().optional(),
    timestamp: z.number().optional(),
    call: z.unknown().optional().nullable(),
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

type LlmState = {
  call: Record<string, unknown> | null;
  beginSent: boolean;
};

function sendToRetell(ws: WebSocket, payload: object) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function responseEvent(
  responseId: number,
  content: string,
  contentComplete: boolean,
  end_call: boolean,
  extra?: { transfer_number?: string; no_interruption_allowed?: boolean },
) {
  const o: {
    response_type: "response";
    response_id: number;
    content: string;
    content_complete: boolean;
    end_call: boolean;
    transfer_number?: string;
  } = {
    response_type: "response",
    response_id: responseId,
    content,
    content_complete: contentComplete,
    end_call,
  };
  if (extra?.transfer_number) o.transfer_number = extra.transfer_number;
  return o;
}

function isCallInit(s: string | undefined) {
  if (!s) return false;
  return s === "call_initated" || s === "call_initiated" || s === "call_init" || s === "initiated";
}

function firstNameFromCall(raw: z.infer<typeof retellIncomingSchema>, call: LlmState["call"]) {
  const top = (raw as { first_name?: string }).first_name;
  if (typeof top === "string" && top.trim()) return top.trim();
  if (!call || typeof call !== "object") {
    return "φίλε";
  }
  const meta = mergeCallMetadata(
    call as {
      metadata?: Record<string, unknown> | null;
      retell_llm_dynamic_variables?: Record<string, string> | null;
    },
  ) as Record<string, string | undefined | null>;
  return getFirstName(meta);
}

async function handleResponseOrReminder(
  ws: WebSocket,
  interaction: "response_required" | "reminder_required",
  request: z.infer<typeof retellIncomingSchema>,
  state: LlmState,
) {
  const rid = typeof request.response_id === "number" ? request.response_id : 1;
  if (interaction === "reminder_required") {
    sendToRetell(ws, responseEvent(rid, "Είστε ακόμα εκεί;", true, false));
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    sendToRetell(
      ws,
      responseEvent(rid, "Υπηρεσία προσωρινά μη διαθέσιμη.", true, true),
    );
    return;
  }
  const callObj = state.call ?? (request as { call?: unknown }).call;
  const meta = mergeCallMetadata(
    (typeof callObj === "object" && callObj
      ? callObj
      : null) as {
        metadata?: Record<string, unknown> | null;
        retell_llm_dynamic_variables?: Record<string, string> | null;
      } | null,
  ) as Record<string, string | undefined | null>;
  const first = getFirstName(meta);

  const transcript = request.transcript ?? [];
  const msgs = transcriptToMessages(
    transcript.map((t) => ({ role: t.role, content: t.content == null ? "" : String(t.content) })),
  );
  if (msgs.length === 0) {
    sendToRetell(
      ws,
      responseEvent(
        rid,
        "Χρόνια πολλά! Να είστε καλά, και μη διστάσετε να επικοινωνήσετε με το γραφείο μας.",
        true,
        true,
      ),
    );
    return;
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
    sendToRetell(
      ws,
      responseEvent(
        rid,
        "Συγνώμη, υπήρξε μικρή καθυστέρηση. Ξαναλέτε, σας παρακαλώ, τι χρειάζεστε;",
        true,
        false,
      ),
    );
    return;
  }
  const claudeRes = result;
  const textBlock = claudeRes.content[0];
  if (!textBlock || textBlock.type !== "text") {
    sendToRetell(ws, responseEvent(rid, "Χρόνια πολλά! Να είστε καλά.", true, true));
    return;
  }
  const spoken = textBlock.text.trim();
  const h = applyRetellHeuristics(spoken);
  const transferNum = process.env.RETELL_TRANSFER_NUMBER?.trim();
  if (h.transfer_call && transferNum) {
    sendToRetell(ws, responseEvent(rid, spoken, true, false, { transfer_number: transferNum }));
    return;
  }
  if (h.transfer_call && !transferNum) {
    sendToRetell(
      ws,
      responseEvent(rid, `${spoken} (Μεταφορά: ορίστε RETELL_TRANSFER_NUMBER.)`, true, false),
    );
    return;
  }
  let endCall = h.end_call;
  if (!h.end_call) {
    const lo = spoken.toLowerCase();
    if (lo.includes("χρόνια πολλά") && !spoken.includes("?")) {
      endCall = true;
    }
  }
  sendToRetell(ws, responseEvent(rid, spoken, true, endCall));
}

function sendBeginGreeting(ws: WebSocket, state: LlmState) {
  const name = firstNameFromCall(
    { transcript: [] } as z.infer<typeof retellIncomingSchema>,
    state.call,
  );
  const opening = `Καλημέρα ${name}! Καλώ από το πολιτικό γραφείο του Κώστα Καραγκούνη.`;
  sendToRetell(
    ws,
    responseEvent(0, opening, true, false),
  );
  state.beginSent = true;
}

/**
 * Retell custom LLM WebSocket protocol (text JSON messages).
 * @see https://docs.retellai.com/api-references/llm-websocket
 */
export function attachRetellLlmSocket(ws: WebSocket, callId: string) {
  const state: LlmState = { call: null, beginSent: false };
  const config = {
    response_type: "config" as const,
    config: {
      auto_reconnect: true,
      call_details: true,
    },
  };
  sendToRetell(ws, config);
  console.log(`[retell-llm-ws] connected call_id=${callId}`);

  ws.on("message", async (raw, isBinary) => {
    if (isBinary) {
      console.error("[retell-llm-ws] binary message rejected");
      return;
    }
    const data = raw.toString("utf8");
    let parsed: z.infer<typeof retellIncomingSchema>;
    try {
      const j = JSON.parse(data);
      const s = retellIncomingSchema.safeParse(j);
      if (!s.success) {
        console.error("[retell-llm-ws] invalid message", s.error);
        return;
      }
      parsed = s.data;
    } catch (e) {
      console.error("[retell-llm-ws] JSON parse", e);
      return;
    }
    const it = (parsed.interaction_type ?? "").trim();
    try {
      if (it === "ping_pong" && typeof parsed.timestamp === "number") {
        sendToRetell(ws, {
          response_type: "ping_pong" as const,
          timestamp: parsed.timestamp,
        });
        return;
      }
      if (it === "call_details" && (parsed as { call?: unknown }).call) {
        state.call = (parsed as { call: Record<string, unknown> }).call;
        if (!state.beginSent) {
          sendBeginGreeting(ws, state);
        }
        return;
      }
      if (it === "update_only") {
        return;
      }
      if (it === "reminder_required") {
        await handleResponseOrReminder(ws, "reminder_required", parsed, state);
        return;
      }
      if (it === "response_required") {
        await handleResponseOrReminder(ws, "response_required", parsed, state);
        return;
      }
      if (isCallInit(it)) {
        if (!state.beginSent) {
          if ((parsed as { call?: unknown }).call) {
            state.call = (parsed as { call: Record<string, unknown> }).call;
          }
          sendBeginGreeting(ws, state);
        }
        return;
      }
      // Unknown — log only
      console.log("[retell-llm-ws] unhandled interaction_type", it);
    } catch (e) {
      console.error("[retell-llm-ws] message handler", e);
    }
  });
}
