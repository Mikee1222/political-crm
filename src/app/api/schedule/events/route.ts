import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { getCalendarClientForUser, mapEventType } from "@/lib/google-calendar";
import { hasMinRole } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();

  const timeMin = request.nextUrl.searchParams.get("timeMin");
  const timeMax = request.nextUrl.searchParams.get("timeMax");
  if (!timeMin || !timeMax) {
    return NextResponse.json({ error: "Χρειάζονται timeMin, timeMax" }, { status: 400 });
  }
  const cal = await getCalendarClientForUser(user.id);
  if (!cal) {
    return NextResponse.json({ events: [], connected: false });
  }
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });
  const items = res.data.items ?? [];
  const events = items.map((e) => ({
    id: e.id,
    title: e.summary,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location,
    description: e.description,
    type: mapEventType(e),
  }));
  return NextResponse.json({ events, connected: true });
}

export async function POST(request: NextRequest) {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
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
}
