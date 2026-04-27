import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { type UserProfile } from "@/lib/auth-helpers";
import {
  ALEX_TOOLS,
  buildSystemPrompt,
  type FindRow,
  historyToClaude,
  runAlexTool,
} from "@/lib/ai-assistant-tools";
import { hasMinRole } from "@/lib/roles";
import { z } from "zod";
import type { ActionPayload } from "@/lib/ai-assistant-actions";
export const dynamic = 'force-dynamic';

const pageContextSchema = z.object({
  type: z.literal("contact"),
  contactId: z.string().uuid(),
  contactName: z.string().min(1).max(200),
});

const bodySchema = z.object({
  message: z.string().min(1).max(32_000),
  conversationId: z.string().uuid(),
  pageContext: pageContextSchema.optional().nullable(),
  attachment: z
    .object({
      type: z.literal("spreadsheet_import"),
      rows: z.array(z.record(z.string(), z.unknown())),
      fileName: z.string().max(200).optional(),
      /** First sheet name when it is a place (e.g. Αστακός), not generic Sheet1 */
      sheetName: z.string().max(200).optional(),
      /** Explicit municipality/area hint from client */
      contextMunicipality: z.string().max(200).optional(),
    })
    .optional(),
});

const MODEL = "claude-sonnet-4-6";

type AssistantActionBlob = {
  findResults?: FindRow[];
  /** /contacts?… for «Δείξε στις Επαφές» */
  filterUrl?: string;
  toolsExecuted?: string[];
  confirmCall?: { contact_id: string; name: string; phone: string } | null;
  startCallMeta?: { name: string; phone: string } | null;
  pendingAction?: ActionPayload | null;
  executed?: boolean;
};

function sliceMessages(
  prior: { role: "user" | "assistant"; content: string }[],
  newUser: string,
): MessageParam[] {
  const base = historyToClaude(prior);
  const next: MessageParam[] = [...base, { role: "user" as const, content: newUser }];
  if (next.length > 20) {
    return next.slice(-20);
  }
  return next;
}

export async function POST(request: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Λείπει η ρύθμιση ANTHROPIC_API_KEY στον διακομιστή" },
      { status: 503 },
    );
  }

  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile, supabase } = crm;
  if (!user || !profile) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  const p: UserProfile = profile;

  let bodyIn: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Χρειάζεται conversationId" }, { status: 400 });
    }
    bodyIn = parsed.data;
  } catch {
    return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
  }

  const { message, conversationId, pageContext: rawPageContext, attachment: rawAttachment } = bodyIn;
  const pageContext = rawPageContext ?? undefined;
  const importRowsForTool =
    hasMinRole(p.role, "manager") && rawAttachment?.type === "spreadsheet_import" ? rawAttachment.rows : undefined;

  function isGenericSheetName(name: string | undefined): boolean {
    if (!name || !name.trim()) return true;
    const t = name.trim();
    if (/^sheet\d*$/i.test(t)) return true;
    if (/^φ[ύυ]λλ[οό]\d*$/i.test(t)) return true;
    return false;
  }

  function municipalityHintFromFileBaseName(fileName: string | undefined): string | undefined {
    if (!fileName?.trim()) return undefined;
    const base = fileName
      .replace(/^.*[/\\]/, "")
      .replace(/\.[^.]+$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (base.length < 2 || base.length > 120) return undefined;
    const lower = base.toLowerCase();
    if (/^(export|data|contacts|επαφ|book\d*|new\s*spreadsheet|untitled|timesheet)/i.test(lower)) {
      return undefined;
    }
    return base;
  }

  const importContextMunicipality: string | undefined = (() => {
    if (!hasMinRole(p.role, "manager") || rawAttachment?.type !== "spreadsheet_import") return undefined;
    const explicit = rawAttachment.contextMunicipality?.trim();
    if (explicit) return explicit;
    const s = rawAttachment.sheetName?.trim();
    if (s && !isGenericSheetName(s)) return s;
    return municipalityHintFromFileBaseName(rawAttachment.fileName) ?? undefined;
  })();
  const cookie = request.headers.get("cookie") ?? "";
  const origin = request.nextUrl.origin;

  const forward = async (path: string, init: RequestInit) => {
    const h = new Headers(init.headers as HeadersInit);
    h.set("cookie", cookie);
    return fetch(new URL(path, origin), { ...init, headers: h });
  };

  const { data: conv, error: convErr } = await supabase
    .from("ai_conversations")
    .select("id, title, user_id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json({ error: "Η συνομιλία δεν βρέθηκε" }, { status: 404 });
  }

  const { data: priorDesc, error: pErr } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const priorChrono = (priorDesc ?? [])
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }))
    .reverse();

  const isFirst = priorChrono.length === 0;
  const historyForClaude = sliceMessages(priorChrono, message);

  const today = new Date().toLocaleDateString("el-GR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const { data: memRows, error: memErr } = await supabase
    .from("alexandra_memory")
    .select("key, value, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (memErr) {
    console.warn("[ai-assistant] alexandra_memory", memErr.message);
  }
  const memoriesBlock =
    (memRows ?? []).length > 0
      ? (memRows ?? [])
          .map((r) => `- [${(r as { key: string; value: string }).key}] ${(r as { value: string }).value}`)
          .join("\n")
      : "— (κενό)";

  const pageContextBlock = pageContext
    ? `Ο χρήστης βρίσκεται στη σελίδα επαφής: ${pageContext.contactName} (id: ${pageContext.contactId})`
    : "Καμία ειδική σελίδα (όχι σε λεπτομέρειες επαφής).";

  const systemPrompt =
    buildSystemPrompt({
      todayDate: today,
      pageContextBlock,
      memoriesBlock,
    }) + `\nΡόλος χρήστη: ${p.role}.`;

  const client = new Anthropic({ apiKey: key });
  const encoder = new TextEncoder();
  const toolsExecuted: string[] = [];
  let lastFind: FindRow[] | null = null;
  let lastFilterUrl: string | undefined;
  let confirm: { contact_id: string; name: string; phone: string } | null = null;
  const fullTextParts: string[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (line: string) => controller.enqueue(encoder.encode(line));
      const sendSse = (data: string) => write(data.endsWith("\n\n") ? data : `${data}\n\n`);

      const toolCtx = {
        supabase,
        forward,
        profile: p,
        role: p.role,
        userId: user.id,
        defaultContactId: pageContext?.contactId ?? null,
        importRows: importRowsForTool,
        importContextMunicipality,
        onBulkProgress: (current: number, total: number) => {
          sendSse(`data: ${JSON.stringify({ event: "bulk_progress", current, total })}\n\n`);
        },
      };

      try {
        let messages: MessageParam[] = historyForClaude;
        for (let round = 0; round < 12; round++) {
          const s = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            messages,
            tools: ALEX_TOOLS,
          });
          s.on("text", (d) => {
            fullTextParts.push(d);
            sendSse(`data: ${JSON.stringify({ token: d })}\n\n`);
          });
          s.on("error", (err) => {
            console.error("[ai-assistant] stream error", err);
          });
          const final = await s.finalMessage();
          const reason = final.stop_reason;

          if (reason === "tool_use") {
            const toolResultBlocks: ToolResultBlockParam[] = [];
            for (const block of final.content) {
              if (block.type !== "tool_use") continue;
              const tr = await runAlexTool(
                block.name,
                block.input as Record<string, unknown>,
                toolCtx,
              );
              if (tr.findResults) {
                lastFind = tr.findResults;
              }
              if (tr.filterUrl) {
                lastFilterUrl = tr.filterUrl;
              }
              if (tr.confirmCall) {
                confirm = tr.confirmCall;
                sendSse(
                  `data: ${JSON.stringify({
                    event: "confirm_call",
                    contact_id: tr.confirmCall.contact_id,
                    name: tr.confirmCall.name,
                    phone: tr.confirmCall.phone,
                  })}\n\n`,
                );
              }
              if (tr.executedToolName) {
                toolsExecuted.push(tr.executedToolName);
                if (tr.showExecutedTag !== false) {
                  sendSse(`data: ${JSON.stringify({ event: "executed", tool: tr.executedToolName })}\n\n`);
                }
              }
              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: tr.content,
              });
            }
            if (toolResultBlocks.length === 0) {
              break;
            }
            messages = [
              ...messages,
              { role: "assistant", content: final.content },
              { role: "user", content: toolResultBlocks },
            ];
            continue;
          }
          break;
        }

        const reply = fullTextParts.join("").trim() || "—";

        const { error: uErr } = await supabase.from("ai_messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: message,
          action: null,
          context_label: null,
        });
        if (uErr) {
          sendSse(`data: ${JSON.stringify({ error: uErr.message })}\n\n`);
          sendSse("data: [DONE]\n\n");
          return;
        }

        let actionBlob: AssistantActionBlob;
        const uniq = [...new Set(toolsExecuted)];
        if (confirm && hasMinRole(p.role, "manager")) {
          actionBlob = {
            findResults: lastFind ?? undefined,
            filterUrl: lastFilterUrl,
            toolsExecuted: uniq.length ? uniq : undefined,
            confirmCall: confirm,
            startCallMeta: { name: confirm.name, phone: confirm.phone },
            pendingAction: { action: "start_call", contact_id: confirm.contact_id },
            executed: uniq.length > 0,
          };
        } else if (confirm && !hasMinRole(p.role, "manager")) {
          actionBlob = {
            findResults: lastFind ?? undefined,
            filterUrl: lastFilterUrl,
            toolsExecuted: uniq.length ? uniq : undefined,
            executed: uniq.length > 0,
          };
        } else {
          actionBlob = {
            findResults: lastFind ?? undefined,
            filterUrl: lastFilterUrl,
            toolsExecuted: uniq.length ? uniq : undefined,
            executed: uniq.length > 0,
          };
        }

        const { error: aErr } = await supabase.from("ai_messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: reply,
          action: actionBlob,
          context_label: null,
        });
        if (aErr) {
          sendSse(`data: ${JSON.stringify({ error: aErr.message })}\n\n`);
        }

        const newTitle = message.trim().slice(0, 50) || "Νέα συνομιλία";
        const needsTitle = !conv.title || !String(conv.title).trim();
        await supabase
          .from("ai_conversations")
          .update({
            updated_at: new Date().toISOString(),
            ...(needsTitle && isFirst ? { title: newTitle } : {}),
          })
          .eq("id", conversationId);

        sendSse("data: [DONE]\n\n");
      } catch (e) {
        console.error("[ai-assistant]", e);
        sendSse(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα" })}\n\n`);
        sendSse("data: [DONE]\n\n");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Long bulk imports (many thousands of rows). */
export const maxDuration = 300;
