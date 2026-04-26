import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data: events, error: e1 } = await supabase
      .from("events_local")
      .select("id, title, description, date, start_time, end_time, location, type, max_attendees, status, created_at")
      .order("date", { ascending: true });
    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 400 });
    }
    const ids = (events ?? []).map((r) => (r as { id: string }).id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: rsvpRows } = await supabase.from("event_rsvps").select("event_id").in("event_id", ids);
      for (const r of rsvpRows ?? []) {
        const eid = (r as { event_id: string }).event_id;
        counts[eid] = (counts[eid] ?? 0) + 1;
      }
    }
    return NextResponse.json({
      events: (events ?? []).map((e) => ({
        ...(e as object),
        attendee_count: counts[(e as { id: string }).id] ?? 0,
      })),
    });
  } catch (e) {
    console.error("[api/events GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const b = (await request.json()) as Record<string, unknown>;
    if (!String(b.title ?? "").trim() || !b.date) {
      return NextResponse.json({ error: "Υποχρεωτικά title, date" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("events_local")
      .insert({
        title: String(b.title),
        description: b.description != null ? String(b.description) : null,
        date: String(b.date),
        start_time: b.start_time != null ? String(b.start_time) : null,
        end_time: b.end_time != null ? String(b.end_time) : null,
        location: b.location != null ? String(b.location) : null,
        type: (b.type as string) || "Εκδήλωση",
        max_attendees: b.max_attendees != null ? Number(b.max_attendees) : null,
        status: (b.status as string) || "Προγραμματισμένη",
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[api/events POST]", e);
    return nextJsonError();
  }
}
