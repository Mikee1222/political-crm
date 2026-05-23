import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const yearsBack = Math.min(5, Math.max(0, Number(request.nextUrl.searchParams.get("years_back") ?? "0") || 0));
    const yearsForward = Math.min(5, Math.max(0, Number(request.nextUrl.searchParams.get("years_forward") ?? "1") || 1));

    const now = new Date();
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - yearsBack);
    from.setMonth(0, 1);
    const to = new Date(now);
    to.setFullYear(to.getFullYear() + yearsForward);
    to.setMonth(11, 31);

    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);

    const { data: rsvps, error: rsvpErr } = await supabase
      .from("event_rsvps")
      .select("event_id, status")
      .eq("contact_id", params.id);
    if (rsvpErr) {
      return NextResponse.json({ error: rsvpErr.message }, { status: 400 });
    }

    const eventIds = [...new Set((rsvps ?? []).map((r) => (r as { event_id: string }).event_id))];
    if (eventIds.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const { data: events, error: evErr } = await supabase
      .from("events_local")
      .select("id, title, description, date, start_time, end_time, location, type, status")
      .in("id", eventIds)
      .gte("date", fromIso)
      .lte("date", toIso)
      .order("date", { ascending: true });
    if (evErr) {
      return NextResponse.json({ error: evErr.message }, { status: 400 });
    }

    const statusByEvent = new Map<string, string>();
    for (const r of rsvps ?? []) {
      const row = r as { event_id: string; status: string | null };
      statusByEvent.set(row.event_id, row.status ?? "");
    }

    return NextResponse.json({
      events: (events ?? []).map((e) => {
        const row = e as {
          id: string;
          title: string;
          description: string | null;
          date: string;
          start_time: string | null;
          end_time: string | null;
          location: string | null;
          type: string | null;
          status: string | null;
        };
        return { ...row, rsvp_status: statusByEvent.get(row.id) ?? null };
      }),
    });
  } catch (e) {
    console.error("[api/contacts/id/events GET]", e);
    return nextJsonError();
  }
}
