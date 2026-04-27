import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  applyRetellHeuristics,
  buildGreekPoliticalOfficeSystemPrompt,
  getContactId,
  getFirstName,
  mergeCallMetadata,
  RETELL_SONNET_MODEL,
  transcriptToMessages,
} from "@/lib/retell-llm";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const maxDuration = 60;

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

type RetellLlmResponse = {
  response_id: number;
  content: string;
  content_complete: boolean;
  end_call: boolean;
  transfer_call?: boolean;
};

function respond(
  responseId: number | undefined,
  content: string,
  end_call: boolean,
  transfer_call: boolean,
): RetellLlmResponse {
  const o: RetellLlmResponse = {
    response_id: typeof responseId === "number" && Number.isFinite(responseId) ? responseId : 1,
    content,
    content_complete: true,
    end_call,
  };
  if (transfer_call) o.transfer_call = true;
  return o;
}

function isCallInit(s: string | undefined) {
  if (!s) return false;
  return s === "call_initated" || s === "call_initiated" || s === "call_init" || s === "initiated";
}

export async function POST(request: Request) {
  try {
  const key = process.env.ANTHROPIC_API_KEY;
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Άκυρα δεδομένα αιτήματος Retell LLM" }, { status: 400 });
  }
  const body = parsed.data;
  const it = body.interaction_type?.trim() ?? "";
  const rid = body.response_id;
  const call = body.call ?? null;
  const meta = mergeCallMetadata(call) as Record<string, string | undefined | null>;
  const first = getFirstName(meta);

  if (it === "reminder_required" || it === "reminder") {
    return NextResponse.json(respond(rid, "Είστε ακόμα εκεί;", false, false));
  }

  if (isCallInit(it)) {
    let nameForGreet = first;
    const cId = getContactId(meta);
    if (cId) {
      try {
        const admin = createServiceClient();
        const { data: row } = await admin
          .from("contacts")
          .select("first_name")
          .eq("id", cId)
          .maybeSingle();
        const fn = (row as { first_name?: string } | null)?.first_name;
        if (fn && String(fn).trim()) nameForGreet = String(fn).trim();
      } catch (e) {
        console.error("[api/retell/llm] call_init contact fetch", e);
      }
    }
    const opening = `Καλημέρα ${nameForGreet}! Καλώ από το πολιτικό γραφείο του Κώστα Καραγκούνη.`;
    return NextResponse.json(respond(rid, opening, false, false));
  }

  if (it === "response_required") {
    if (!key) {
      return NextResponse.json(
        { error: "Λείπει η ANTHROPIC_API_KEY· δεν μπορεί ο βοηθός να απαντήσει" },
        { status: 503 },
      );
    }
    const transcript = body.transcript ?? [];
    const msgs = transcriptToMessages(
      transcript.map((t) => ({ role: t.role, content: t.content == null ? "" : String(t.content) })),
    );
    if (msgs.length === 0) {
      return NextResponse.json(
        respond(rid, "Χρόνια πολλά! Να είστε καλά, και μη διστάσετε να επικοινωνήσετε με το γραφείο μας.", true, false),
      );
    }
    const system = buildGreekPoliticalOfficeSystemPrompt(first);
    const client = new Anthropic({ apiKey: key });
    const claudeRes = await client.messages.create({
      model: RETELL_SONNET_MODEL,
      max_tokens: 512,
      system,
      messages: msgs,
    });
    const textBlock = claudeRes.content[0];
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(respond(rid, "Χρόνια πολλά! Να είστε καλά.", true, false));
    }
    const spoken = textBlock.text.trim();
    const h = applyRetellHeuristics(spoken);
    if (h.transfer_call) {
      return NextResponse.json({
        response_id: typeof rid === "number" ? rid : 1,
        content: spoken,
        content_complete: true,
        end_call: false,
        transfer_call: true,
      });
    }
    let endCall = h.end_call;
    if (!h.end_call) {
      const lo = spoken.toLowerCase();
      if (lo.includes("χρόνια πολλά") && !spoken.includes("?")) {
        endCall = true;
      }
    }
    return NextResponse.json(respond(rid, spoken, endCall, false));
  }

  return NextResponse.json(
    { error: `Άγνωστο interaction_type: ${it || "—"}. Αναμενόμενα: call_initated, response_required, reminder_required` },
    { status: 400 },
  );
  } catch (e) {
    console.error("[api/retell/llm]", e);
    return nextJsonError();
  }
}
