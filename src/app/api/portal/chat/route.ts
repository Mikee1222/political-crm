import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { nextJsonError } from "@/lib/api-resilience";
import { checkPortalChatRateLimit, getClientIp } from "@/lib/portal-chat-rate-limit";
import { PORTAL_SYSTEM_PROMPT } from "@/lib/portal-alexandra-prompt";
import { buildPortalChatNewsContext } from "@/lib/portal-chat-context";

const MODEL = "claude-sonnet-4-6";

type Hist = { role: "user" | "assistant"; content: string };

function buildMessages(hist: Hist[] | undefined, userMessage: string): MessageParam[] {
  const out: MessageParam[] = [];
  const recent = (hist ?? []).slice(-20);
  for (const m of recent) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content.slice(0, 20_000) });
    } else {
      out.push({ role: "assistant", content: m.content.slice(0, 20_000) });
    }
  }
  out.push({ role: "user", content: userMessage.slice(0, 20_000) });
  return out;
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limited = checkPortalChatRateLimit(ip);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Έχετε στείλει πολλά μηνύματα. Δοκιμάστε ξανά σε λίγο." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
      );
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Υπηρεσία μη διαθέσιμη" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      conversationHistory?: Hist[];
    };
    const userMessage = String(body.message ?? "").trim();
    if (!userMessage) {
      return NextResponse.json({ error: "Κενό μήνυμα" }, { status: 400 });
    }
    if (userMessage.length > 12_000) {
      return NextResponse.json({ error: "Πολύ μεγάλο μήνυμα" }, { status: 400 });
    }

    const history = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];
    const clean: Hist[] = history
      .filter(
        (h): h is Hist =>
          h != null &&
          typeof h === "object" &&
          (h as Hist).role !== undefined &&
          (h as Hist).content != null &&
          ((h as Hist).role === "user" || (h as Hist).role === "assistant"),
      )
      .map((h) => ({
        role: (h as Hist).role,
        content: String((h as Hist).content).slice(0, 20_000),
      }));
    const messages = buildMessages(clean, userMessage);
    const newsContext = await buildPortalChatNewsContext(userMessage);
    const system = PORTAL_SYSTEM_PROMPT + newsContext;

    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: system,
      messages,
    });
    const block = msg.content[0];
    if (block.type !== "text") {
      return NextResponse.json({ error: "Άκυρη απάντηση" }, { status: 502 });
    }
    return NextResponse.json({ reply: block.text });
  } catch (e) {
    console.error("[api/portal/chat]", e);
    return nextJsonError();
  }
}
