import { NextResponse, type NextRequest } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { checkPortalVoiceSessionRateLimit, getClientIp } from "@/lib/portal-chat-rate-limit";
export const dynamic = "force-dynamic";

const ELEVEN_GET_SIGNED = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

/**
 * Public signed URL for portal voice (no CRM auth). Same agent as CRM; use client-side
 * `overrides.agent.prompt` for the portal system prompt.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limited = checkPortalVoiceSessionRateLimit(ip);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Έχετε στείλει πολλά αιτήματα. Δοκιμάστε ξανά αργότερα." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
      );
    }

    const key = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
    if (!key) {
      return NextResponse.json({ error: "Λείπει ELEVENLABS_API_KEY" }, { status: 503 });
    }
    if (!agentId?.trim()) {
      return NextResponse.json({ error: "Λείπει NEXT_PUBLIC_ELEVENLABS_AGENT_ID" }, { status: 503 });
    }

    const url = new URL(ELEVEN_GET_SIGNED);
    url.searchParams.set("agent_id", agentId.trim());

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "xi-api-key": key },
    });

    const data = (await res.json().catch(() => ({}))) as { signed_url?: string };
    if (!res.ok) {
      console.error("[api/portal/voice/session] ElevenLabs", res.status, data);
      return NextResponse.json({ error: "Δεν δόθηκε σύνδεση φωνής" }, { status: 502 });
    }
    if (!data.signed_url) {
      return NextResponse.json({ error: "Άκυρη απάντηση από ElevenLabs" }, { status: 502 });
    }

    return NextResponse.json({ signed_url: data.signed_url });
  } catch (e) {
    console.error("[api/portal/voice/session]", e);
    return nextJsonError();
  }
}
