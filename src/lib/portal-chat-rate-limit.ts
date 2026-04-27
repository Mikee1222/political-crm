const WINDOW_MS = 60 * 60 * 1000;
const CHAT_MAX = 10;
const VOICE_MAX = 20;

type Entry = { count: number; resetAt: number };
const chatByIp = new Map<string, Entry>();
const voiceByIp = new Map<string, Entry>();

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    return fwd.split(",")[0]!.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function checkLimit(
  m: Map<string, Entry>,
  max: number,
  ip: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let e = m.get(ip);
  if (!e || now >= e.resetAt) {
    e = { count: 0, resetAt: now + WINDOW_MS };
    m.set(ip, e);
  }
  if (e.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((e.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  e.count += 1;
  return { ok: true };
}

/** 10 public chat messages per IP per hour. */
export function checkPortalChatRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  return checkLimit(chatByIp, CHAT_MAX, ip);
}

/** ElevenLabs signed-URL fetches (voice) — separate bucket so text chat is not starved. */
export function checkPortalVoiceSessionRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  return checkLimit(voiceByIp, VOICE_MAX, ip);
}
