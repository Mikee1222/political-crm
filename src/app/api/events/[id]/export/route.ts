import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

function esc(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data: rsvps, error } = await supabase
      .from("event_rsvps")
      .select("status, contact_id")
      .eq("event_id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const cids = [...new Set((rsvps ?? []).map((r) => (r as { contact_id: string }).contact_id))];
    const { data: crows } =
      cids.length > 0
        ? await supabase
            .from("contacts")
            .select("id, first_name, last_name, phone")
            .in("id", cids)
        : { data: [] as { id: string; first_name: string; last_name: string; phone: string | null }[] };
    const cmap = new Map((crows ?? []).map((c) => [c.id, c]));
    const { data: ev } = await supabase.from("events_local").select("title").eq("id", params.id).single();
    const title = (ev as { title?: string } | null)?.title ?? "ekdilosi";
    const lines: string[] = ["Όνομα,Επίθετο,Τηλέφωνο,Κατάσταση"];
    for (const r of rsvps ?? []) {
      const row = r as { status: string; contact_id: string };
      const c = cmap.get(row.contact_id);
      lines.push(
        [esc(c?.first_name), esc(c?.last_name), esc(c?.phone ?? null), esc(row.status)].join(","),
      );
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rsvp-${String(title).replace(/\s+/g, "-")}.csv"`,
      },
    });
  } catch (e) {
    console.error("[api/events export]", e);
    return nextJsonError();
  }
}
