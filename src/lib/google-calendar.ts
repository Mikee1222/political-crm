import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { createServiceClient } from "./supabase/admin";
import { CALENDAR_EVENT_TYPES, type CalendarEventType } from "./calendar-event-types";
export { CALENDAR_EVENT_TYPES, type CalendarEventType } from "./calendar-event-types";

function createOAuth2() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

export function parseOAuthState(state: string) {
  const raw = Buffer.from(state, "base64url").toString("utf8");
  const p = JSON.parse(raw) as { u: string; t: number };
  if (Date.now() - p.t > 15 * 60 * 1000) {
    throw new Error("Ληγμένο state");
  }
  return p;
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = createOAuth2();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

type GoogleTokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  expiry: string | null;
};

function tokenExpiryMs(row: GoogleTokenRow): number | undefined {
  const raw = row.expiry ?? row.expires_at;
  if (!raw) return undefined;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

export async function getCalendarClientForUser(
  userId: string,
): Promise<ReturnType<typeof google.calendar> | null> {
  const s = createServiceClient();
  const { data, error } = await s.from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data?.refresh_token) return null;
  const row = data as GoogleTokenRow;
  const oauth2 = createOAuth2();
  const expMs = tokenExpiryMs(row);
  oauth2.setCredentials({
    access_token: row.access_token ?? undefined,
    refresh_token: row.refresh_token,
    expiry_date: expMs,
  });
  oauth2.on("tokens", (t) => {
    const expiresIso = t.expiry_date ? new Date(t.expiry_date).toISOString() : null;
    void (async () => {
      const { error: upErr } = await s
        .from("google_tokens")
        .update({
          access_token: t.access_token ?? row.access_token,
          refresh_token: t.refresh_token ?? row.refresh_token,
          expires_at: expiresIso,
          expiry: expiresIso,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (upErr) {
        console.error("[google-calendar] token persist", upErr.message);
      }
    })();
  });
  /* Refresh access token if missing or expiring (getAccessToken uses refresh_token). */
  try {
    await oauth2.getAccessToken();
  } catch (e) {
    console.error("[google-calendar] getAccessToken", e);
    return null;
  }
  return google.calendar({ version: "v3", auth: oauth2 });
}

export function mapEventType(
  e: calendar_v3.Schema$Event,
): CalendarEventType {
  const t = (e.extendedProperties?.private as Record<string, string> | undefined)?.crmType;
  if (t && t in CALENDAR_EVENT_TYPES) return t as CalendarEventType;
  return "other";
}
