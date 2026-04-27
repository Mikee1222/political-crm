import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("event_rsvps")
      .select("id, event_id, contact_id, status, created_at")
      .eq("event_id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const ids = [...new Set((data ?? []).map((r) => (r as { contact_id: string }).contact_id))];
    const contactsMap: Record<string, { id: string; first_name: string; last_name: string; phone: string | null }> = {};
    if (ids.length) {
      const { data: crows } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, phone")
        .in("id", ids);
      for (const c of crows ?? []) {
        const row = c as { id: string; first_name: string; last_name: string; phone: string | null };
        contactsMap[row.id] = row;
      }
    }
    return NextResponse.json({
      rsvps: (data ?? []).map((r) => {
        const row = r as { id: string; contact_id: string; status: string; created_at: string };
        return { ...row, contact: contactsMap[row.contact_id] ?? null };
      }),
    });
  } catch (e) {
    console.error("[api/events rsvps GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const b = (await request.json()) as { contact_id?: string; status?: string };
    if (!b.contact_id?.trim()) {
      return NextResponse.json({ error: "contact_id" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("event_rsvps")
      .upsert(
        {
          event_id: params.id,
          contact_id: b.contact_id,
          status: b.status || "Επιβεβαιωμένος",
        },
        { onConflict: "event_id,contact_id" },
      )
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[api/events rsvps POST]", e);
    return nextJsonError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const contactId = request.nextUrl.searchParams.get("contact_id");
    if (!contactId) {
      return NextResponse.json({ error: "contact_id" }, { status: 400 });
    }
    const { error } = await supabase
      .from("event_rsvps")
      .delete()
      .eq("event_id", params.id)
      .eq("contact_id", contactId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/events rsvps DELETE]", e);
    return nextJsonError();
  }
}
