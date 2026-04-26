import { NextResponse } from "next/server";
import { getSessionWithProfile } from "@/lib/auth-helpers";

const ELEVEN_GET_SIGNED = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

/**
 * Before using voice mode, create a Conversational AI agent in ElevenLabs dashboard:
 * 1. Go to elevenlabs.io → Conversational AI → Create Agent
 * 2. Set voice to ID: 1gkXJMvrzBWAwt0XqBaa
 * 3. Set language to Greek
 * 4. Set system prompt (office CRM + concise Greek), see product docs
 * 5. Copy Agent ID to NEXT_PUBLIC_ELEVENLABS_AGENT_ID
 */
export async function POST() {
  const { user } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
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

  const data = (await res.json().catch(() => ({}))) as { signed_url?: string; detail?: unknown };
  if (!res.ok) {
    console.error("[voice/session] ElevenLabs", res.status, data);
    return NextResponse.json(
      { error: "Δεν δόθηκε σύνδεση φωνής" },
      { status: res.status === 401 || res.status === 403 ? 502 : 502 },
    );
  }
  if (!data.signed_url) {
    return NextResponse.json({ error: "Άκυρη απάντηση από ElevenLabs" }, { status: 502 });
  }

  return NextResponse.json({ signed_url: data.signed_url });
}

export const dynamic = "force-dynamic";
