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

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export function getGoogleAuthUrl(userId: string) {
  const oauth2 = createOAuth2();
  const state = Buffer.from(
    JSON.stringify({ u: userId, t: Date.now() }),
  ).toString("base64url");
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
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

export async function getCalendarClientForUser(
  userId: string,
): Promise<ReturnType<typeof google.calendar> | null> {
  const s = createServiceClient();
  const { data, error } = await s.from("google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data?.refresh_token) return null;
  const oauth2 = createOAuth2();
  oauth2.setCredentials({
    access_token: data.access_token ?? undefined,
    refresh_token: data.refresh_token,
    expiry_date: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
  });
  oauth2.on("tokens", (t) => {
    void s
      .from("google_tokens")
      .update({
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? data.refresh_token,
        expires_at: t.expiry_date ? new Date(t.expiry_date).toISOString() : data.expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  });
  return google.calendar({ version: "v3", auth: oauth2 });
}

export function mapEventType(
  e: calendar_v3.Schema$Event,
): CalendarEventType {
  const t = (e.extendedProperties?.private as Record<string, string> | undefined)?.crmType;
  if (t && t in CALENDAR_EVENT_TYPES) return t as CalendarEventType;
  return "other";
}
