export const dynamic = "force-dynamic";

import { endOfWeek, startOfWeek } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCalendarClientForUser, listPrimaryCalendarEventsHttp } from "@/lib/google-calendar";
import { hasMinRole, type Role } from "@/lib/roles";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";

const LOG = "[api/schedule/events]";

/** SSR Supabase: `createClient()` uses `createServerClient` + `cookies()` (see `@/lib/supabase/server`). */
async function getUserAndManagerProfile() {
  console.log(`${LOG} 1) createClient() — server client with cookies`);
  const supabase = await createClient();
  console.log(`${LOG} 2) supabase.auth.getUser() (not getSession)`);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  console.log(`${LOG} 3) getUser result`, {
    hasUser: Boolean(user),
    userId: user?.id,
    authError: authErr?.message ?? null,
  });
  if (!user) {
    return { user: null as null, profile: null as { role: Role } | null };
  }
  const { data: row, error: profErr } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (row?.role as Role) || "caller";
  console.log(`${LOG} 4) profile for manager check`, { role, profileError: profErr?.message ?? null });
  return { user, profile: { role } };
}

export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await getUserAndManagerProfile();
    if (!user) {
      console.warn(`${LOG} 401: no user from getUser()`);
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    let timeMin = request.nextUrl.searchParams.get("timeMin");
    let timeMax = request.nextUrl.searchParams.get("timeMax");
    if (!timeMin || !timeMax) {
      const now = new Date();
      timeMin = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
      timeMax = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
    }
    console.log(`${LOG} 5) time range`, { timeMin, timeMax });

    console.log(`${LOG} 6) listPrimaryCalendarEventsHttp (google_tokens via service client)`);
    const result = await listPrimaryCalendarEventsHttp(user.id, timeMin, timeMax);
    console.log(`${LOG} 7) calendar list result`, {
      ok: result.ok,
      code: result.ok ? "ok" : result.code,
    });

    if (!result.ok && result.code === "not_connected") {
      return NextResponse.json({ error: "not_connected", events: [], connected: false });
    }
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "calendar_error",
          message: result.message,
          events: [],
          connected: true,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ events: result.events, connected: true });
  } catch (e) {
    console.error("[api/schedule/events GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getUserAndManagerProfile();
    if (!user) {
      console.warn(`${LOG} POST 401: no user from getUser()`);
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const cal = await getCalendarClientForUser(user.id);
    if (!cal) {
      return NextResponse.json({ error: "Συνδέστε το Google Ημερολόγιο" }, { status: 400 });
    }
    const body = (await request.json()) as {
      title: string;
      start: string;
      end: string;
      location?: string;
      description?: string;
      eventType: "meeting" | "event" | "campaign" | "other";
    };
    if (!body.title || !body.start || !body.end) {
      return NextResponse.json({ error: "Υποχρεωτικά: τίτλος, αρχή, τέλος" }, { status: 400 });
    }
    await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: body.title,
        description: body.description,
        location: body.location,
        start: { dateTime: body.start, timeZone: "Europe/Athens" },
        end: { dateTime: body.end, timeZone: "Europe/Athens" },
        extendedProperties: { private: { crmType: body.eventType ?? "other" } },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/schedule/events POST]", e);
    return nextJsonError();
  }
}
