import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  WebSearchTool20250305,
} from "@anthropic-ai/sdk/resources/messages";
import { type UserProfile } from "@/lib/auth-helpers";
import {
  ALEX_TOOLS,
  buildPageContextBlock,
  buildSystemPrompt,
  type FindRow,
  historyToClaude,
  runAlexTool,
} from "@/lib/ai-assistant-tools";
import { hasMinRole } from "@/lib/roles";
import { getAllowedPermissionKeysForRole } from "@/lib/permission-check";
import { forbidden } from "@/lib/auth-helpers";
import { z } from "zod";
import type { ActionPayload } from "@/lib/ai-assistant-actions";
import { formatTodayLabelAthens } from "@/lib/date-format";
import { inferSpreadsheetContextMunicipality } from "@/lib/alexandra-sheet-parse";
import {
  loadSpreadsheetStash,
  SPREADSHEET_ATTACHMENT_ROW_THRESHOLD,
} from "@/lib/alexandra-spreadsheet-stash";
export const dynamic = 'force-dynamic';

const pageContextSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("contact"),
    contactId: z.string().uuid(),
    contactName: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("request"),
    requestId: z.string().uuid(),
    requestTitle: z.string().min(1).max(500),
    requestStatus: z.string().max(100),
  }),
  z.object({
    type: z.literal("contacts_list"),
    filters: z.record(z.string(), z.unknown()).optional(),
    totalCount: z.number().optional(),
  }),
  z.object({
    type: z.literal("requests_list"),
    filters: z.record(z.string(), z.unknown()).optional(),
    totalCount: z.number().optional(),
  }),
  z.object({
    type: z.literal("campaign"),
    campaignId: z.string().uuid(),
    campaignName: z.string().min(1).max(300),
    status: z.string().max(100),
  }),
  z.object({ type: z.literal("dashboard") }),
  z.object({ type: z.literal("analytics") }),
  z.object({ type: z.literal("tasks") }),
  z.object({ type: z.literal("events") }),
  z.object({ type: z.literal("volunteers") }),
  z.object({ type: z.literal("settings") }),
  z.object({ type: z.literal("namedays") }),
]);

const bodySchema = z.object({
  message: z.string().min(1).max(32_000),
  conversationId: z.string().uuid(),
  pageContext: pageContextSchema.optional().nullable(),
  attachment: z
    .object({
      type: z.literal("spreadsheet_import"),
      rows: z.array(z.record(z.string(), z.unknown())).max(SPREADSHEET_ATTACHMENT_ROW_THRESHOLD).optional().default([]),
      /** Large files: rows uploaded via /api/ai-assistant/spreadsheet-stash in chunks */
      stashed: z.boolean().optional(),
      totalRows: z.number().int().positive().optional(),
      columns: z.array(z.string()).optional(),
      fileName: z.string().max(200).optional(),
      /** First sheet name when it is a place (e.g. Αστακός), not generic Sheet1 */
      sheetName: z.string().max(200).optional(),
      /** Explicit municipality/area hint from client */
      contextMunicipality: z.string().max(200).optional(),
    })
    .optional(),
});

const MODEL = "claude-sonnet-4-6";

/** Anthropic server-side web search (no extra API key; executed by Anthropic). */
const ALEX_WEB_SEARCH_TOOL: WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
};

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

  const allowedKeys = await getAllowedPermissionKeysForRole(p.role);
  if (allowedKeys !== null && !allowedKeys.has("alexandra_use")) {
    return forbidden();
  }

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

  let importRowsForTool: Array<Record<string, unknown>> | undefined;
  let importContextMunicipality: string | undefined;

  if (hasMinRole(p.role, "manager") && rawAttachment?.type === "spreadsheet_import") {
    if (rawAttachment.stashed) {
      try {
        const loaded = await loadSpreadsheetStash(user.id, conversationId);
        if (!loaded) {
          return NextResponse.json(
            { error: "Δεν βρέθηκαν τα δεδομένα του αρχείου. Ξανανέβασε το Excel." },
            { status: 400 },
          );
        }
        if (rawAttachment.totalRows != null && loaded.rows.length !== rawAttachment.totalRows) {
          return NextResponse.json(
            { error: "Ατελές αρχείο import — λείπουν γραμμές. Ξανανέβασε το Excel." },
            { status: 400 },
          );
        }
        importRowsForTool = loaded.rows;
        importContextMunicipality = inferSpreadsheetContextMunicipality(
          loaded.meta.fileName ?? rawAttachment.fileName,
          loaded.meta.sheetName ?? rawAttachment.sheetName,
          loaded.meta.contextMunicipality ?? rawAttachment.contextMunicipality,
        );
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Σφάλμα φόρτωσης αρχείου" },
          { status: 500 },
        );
      }
    } else if (rawAttachment.rows.length > 0) {
      importRowsForTool = rawAttachment.rows;
      importContextMunicipality = inferSpreadsheetContextMunicipality(
        rawAttachment.fileName,
        rawAttachment.sheetName,
        rawAttachment.contextMunicipality,
      );
    }
  }
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

  const today = formatTodayLabelAthens();

  const { data: memRows, error: memErr } = await supabase
    .from("alexandra_memory")
    .select("key, value, updated_at")
    .eq("user_id", user.id)
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

  const pageContextBlock = buildPageContextBlock(pageContext);

  const systemPrompt = buildSystemPrompt({
    todayDate: today,
    pageContextBlock,
    memoriesBlock,
    role: p.role,
  });

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
        conversationId,
        allowedPermissionKeys: allowedKeys === null ? undefined : allowedKeys,
        defaultContactId: pageContext?.type === "contact" ? pageContext.contactId : null,
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
            tools: [...ALEX_TOOLS, ALEX_WEB_SEARCH_TOOL],
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

          if (reason === "pause_turn") {
            messages = [...messages, { role: "assistant", content: final.content }];
            continue;
          }

          if (reason === "tool_use") {
            const toolResultBlocks: ToolResultBlockParam[] = [];
            for (const block of final.content) {
              if (block.type !== "tool_use") continue;
              if (block.name === "web_search") continue;
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
              messages = [...messages, { role: "assistant", content: final.content }];
              continue;
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

        const attachmentRowCount =
          rawAttachment?.type === "spreadsheet_import"
            ? (rawAttachment.totalRows ??
              rawAttachment.rows.length ??
              importRowsForTool?.length ??
              0)
            : 0;
        const userAction =
          rawAttachment?.type === "spreadsheet_import" && attachmentRowCount > 0
            ? {
                spreadsheetAttachment: {
                  fileName: rawAttachment.fileName?.trim() || "αρχείο.xlsx",
                  rowCount: attachmentRowCount,
                },
              }
            : null;

        const { error: uErr } = await supabase.from("ai_messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: message,
          action: userAction,
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
