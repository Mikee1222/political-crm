import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { getCalendarClientForUser, type CalendarEventType } from "@/lib/google-calendar";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();
  const cal = await getCalendarClientForUser(user.id);
  if (!cal) {
    return NextResponse.json({ error: "Όχι σύνδεση" }, { status: 400 });
  }
  const body = (await request.json()) as {
    title?: string;
    start?: string;
    end?: string;
    location?: string;
    description?: string;
    eventType?: CalendarEventType;
  };
  const requestBody: {
    summary?: string;
    location?: string;
    description?: string;
    start?: { dateTime: string; timeZone: string };
    end?: { dateTime: string; timeZone: string };
    extendedProperties?: { private: { crmType: string } };
  } = {};
  if (body.title !== undefined) requestBody.summary = body.title;
  if (body.location !== undefined) requestBody.location = body.location;
  if (body.description !== undefined) requestBody.description = body.description;
  if (body.start) {
    requestBody.start = { dateTime: body.start, timeZone: "Europe/Athens" };
  }
  if (body.end) {
    requestBody.end = { dateTime: body.end, timeZone: "Europe/Athens" };
  }
  if (body.eventType) {
    requestBody.extendedProperties = { private: { crmType: body.eventType } };
  }
  await cal.events.patch({
    calendarId: "primary",
    eventId: params.id,
    requestBody,
  });
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/schedule/events/id PATCH]", e);
    return nextJsonError();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();
  const cal = await getCalendarClientForUser(user.id);
  if (!cal) {
    return NextResponse.json({ error: "Όχι σύνδεση" }, { status: 400 });
  }
  await cal.events.delete({
    calendarId: "primary",
    eventId: params.id,
  });
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/schedule/events/id DELETE]", e);
    return nextJsonError();
  }
}
