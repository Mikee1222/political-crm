import { addMonths, subMonths } from "date-fns";
import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { createServiceClient } from "./supabase/admin";
import { stripHtml } from "./strip-html";
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

export type GoogleTokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  expiry: string | null;
};

function isAccessTokenFresh(row: GoogleTokenRow, skewMs = 60_000): boolean {
  if (!row.access_token) return false;
  const raw = row.expiry ?? row.expires_at;
  if (!raw) return true;
  return new Date(raw).getTime() > Date.now() + skewMs;
}

/** POST https://oauth2.googleapis.com/token — persist new access (+ expiry) in google_tokens. */
export async function refreshAndPersistAccessToken(
  userId: string,
  row: GoogleTokenRow,
): Promise<string | null> {
  if (!row.refresh_token) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[google-calendar] missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
    return null;
  }
  const s = createServiceClient();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: row.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.error("[google-calendar] token refresh", res.status, await res.text().catch(() => ""));
    return null;
  }
  const j = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!j.access_token) return null;
  const expiresIso = j.expires_in
    ? new Date(Date.now() + j.expires_in * 1000).toISOString()
    : null;
  const { error: upErr } = await s
    .from("google_tokens")
    .update({
      access_token: j.access_token,
      refresh_token: j.refresh_token ?? row.refresh_token,
      expires_at: expiresIso,
      expiry: expiresIso,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (upErr) {
    console.error("[google-calendar] persist refresh", upErr.message);
  }
  return j.access_token;
}

export function mapEventType(e: calendar_v3.Schema$Event): CalendarEventType {
  const t = (e.extendedProperties?.private as Record<string, string> | undefined)?.crmType;
  if (t === "portal_appointment") return "meeting";
  if (t && t in CALENDAR_EVENT_TYPES) return t as CalendarEventType;
  return "other";
}

function toScheduleEventView(e: calendar_v3.Schema$Event, calendarId: string) {
  const title = stripHtml(e.summary ?? null) || null;
  const location = e.location ? stripHtml(e.location) || null : null;
  const description = e.description ? stripHtml(e.description) || null : null;
  return {
    id: (e.id ?? "") as string,
    calendarId,
    title,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location,
    description,
    type: mapEventType(e),
  };
}

export type ScheduleEventRow = ReturnType<typeof toScheduleEventView>;

export type GoogleCalendarListEntry = {
  id: string;
  summary?: string | null;
  accessRole?: string | null;
  primary?: boolean | null;
};

type CalendarDebug = {
  calendars_found: GoogleCalendarListEntry[];
  time_range: { timeMin: string; timeMax: string };
};

function defaultFetchRange() {
  const now = new Date();
  return {
    timeMin: subMonths(now, 3).toISOString(),
    timeMax: addMonths(now, 3).toISOString(),
  };
}

/**
 * 1) calendarList — all calendars. 2) events from each. Bearer + 401 refresh.
 * Χωρίς `range`: παράθυρο ±3 μήνες. Με `range`: συγκεκριμένο timeMin/timeMax (ISO, π.χ. +03:00).
 */
export async function listAllCalendarsEventsHttp(
  userId: string,
  range?: { timeMin: string; timeMax: string },
): Promise<
  | ({ ok: true; events: ScheduleEventRow[] } & CalendarDebug)
  | ({ ok: false; code: "not_connected" } & CalendarDebug)
  | ({ ok: false; code: "calendar_error"; message: string } & CalendarDebug)
> {
  const time_range = range ?? defaultFetchRange();
  const { timeMin, timeMax } = time_range;
  const emptyDebug: CalendarDebug = { calendars_found: [], time_range };

  const s = createServiceClient();
  const { data, error } = await s
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[google-calendar] load tokens", error.message);
    return { ok: false, code: "not_connected", ...emptyDebug };
  }
  if (!data) return { ok: false, code: "not_connected", ...emptyDebug };
  const row = data as GoogleTokenRow;
  if (!row.refresh_token && !row.access_token) {
    return { ok: false, code: "not_connected", ...emptyDebug };
  }

  let access: string | null = isAccessTokenFresh(row) ? (row.access_token as string) : null;
  if (!access) {
    access = await refreshAndPersistAccessToken(userId, row);
  }
  if (!access) {
    if (row.access_token) {
      access = row.access_token;
    } else {
      return { ok: false, code: "not_connected", ...emptyDebug };
    }
  }

  const getJson = async (url: string): Promise<{ res: Response; access: string }> => {
    let a = access as string;
    let r = await fetch(url, { headers: { Authorization: `Bearer ${a}` } });
    if (r.status === 401 && row.refresh_token) {
      const re = await refreshAndPersistAccessToken(userId, { ...row, access_token: a });
      if (re) {
        a = re;
        access = re;
        r = await fetch(url, { headers: { Authorization: `Bearer ${re}` } });
      }
    }
    return { res: r, access: a };
  };

  let listPage: string | undefined;
  const calendars: GoogleCalendarListEntry[] = [];
  do {
    const listListUrl = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    listListUrl.searchParams.set("maxResults", "250");
    if (listPage) listListUrl.searchParams.set("pageToken", listPage);
    const { res: cRes } = await getJson(listListUrl.toString());
    if (cRes.status === 401) {
      return { ok: false, code: "not_connected", ...emptyDebug };
    }
    if (!cRes.ok) {
      const t = await cRes.text();
      return {
        ok: false,
        code: "calendar_error",
        message: `calendarList: ${t || cRes.statusText}`,
        ...emptyDebug,
      };
    }
    const cJson = (await cRes.json()) as {
      items?: Array<{ id?: string; summary?: string; accessRole?: string; primary?: boolean }>;
      nextPageToken?: string;
    };
    for (const it of cJson.items ?? []) {
      if (it.id) {
        calendars.push({
          id: it.id,
          summary: it.summary ?? null,
          accessRole: it.accessRole ?? null,
          primary: it.primary ?? null,
        });
      }
    }
    listPage = cJson.nextPageToken;
  } while (listPage);

  if (calendars.length === 0) {
    return { ok: true, events: [], calendars_found: calendars, time_range };
  }

  const allEvents: ScheduleEventRow[] = [];
  for (const cal of calendars) {
    let eventPage: string | undefined;
    do {
      const u = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
      );
      u.searchParams.set("timeMin", timeMin);
      u.searchParams.set("timeMax", timeMax);
      u.searchParams.set("singleEvents", "true");
      u.searchParams.set("orderBy", "startTime");
      u.searchParams.set("maxResults", "250");
      if (eventPage) u.searchParams.set("pageToken", eventPage);
      const { res: eRes, access: curAccess } = await getJson(u.toString());
      if (eRes.status === 401) {
        return { ok: false, code: "not_connected", calendars_found: calendars, time_range };
      }
      if (!eRes.ok) {
        const errText = await eRes.text();
        console.error("[google-calendar] events list for", cal.id, eRes.status, errText);
        break;
      }
      const eJson = (await eRes.json()) as {
        items?: calendar_v3.Schema$Event[];
        nextPageToken?: string;
      };
      for (const e of eJson.items ?? []) {
        allEvents.push(toScheduleEventView(e, cal.id));
      }
      eventPage = eJson.nextPageToken;
      access = curAccess;
    } while (eventPage);
  }

  allEvents.sort((a, b) => {
    const s = a.start ?? "";
    const t = b.start ?? "";
    return s.localeCompare(t);
  });

  return { ok: true, events: allEvents, calendars_found: calendars, time_range };
}

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

/** Πρώτος λογαριασμός Google Calendar (ή APPOINTMENT_CALENDAR_USER_ID). */
export async function getAppointmentCalendarUserId(): Promise<string | null> {
  const env = process.env.APPOINTMENT_CALENDAR_USER_ID?.trim();
  if (env) return env;
  const s = createServiceClient();
  const { data } = await s.from("google_tokens").select("user_id").limit(1).maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

export async function getFreeBusyPrimary(
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<
  { ok: true; busy: { start: string; end: string }[] } | { ok: false; code: "not_connected" }
> {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return { ok: false, code: "not_connected" };
  const r = await cal.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: "Europe/Athens",
      items: [{ id: "primary" }],
    },
  });
  const busy = (r.data.calendars?.primary?.busy ?? []) as { start?: string; end?: string }[];
  return {
    ok: true,
    busy: busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: b.start as string, end: b.end as string })),
  };
}
