import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(
  _: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { id: contactId } = await Promise.resolve(context.params);
    if (!contactId?.trim()) {
      return NextResponse.json({ items: [] });
    }
    const { data, error } = await supabase
      .from("supporters")
      .select("id, support_type, amount, date, notes, created_at")
      .eq("contact_id", contactId)
      .order("date", { ascending: false, nullsFirst: false });
    if (error) {
      console.warn("[supporters GET]", error.message);
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("[supporters GET]", e);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { id: contactId } = await Promise.resolve(context.params);
    if (!contactId?.trim()) {
      return NextResponse.json({ error: "Άκυρο id" }, { status: 400 });
    }
    const b = (await request.json()) as {
      support_type?: string;
      amount?: number | string;
      date?: string;
      notes?: string;
    };
    const { data, error } = await supabase
      .from("supporters")
      .insert({
        contact_id: contactId,
        support_type: b.support_type ?? null,
        amount: b.amount != null && b.amount !== "" ? Number(b.amount) : null,
        date: b.date != null ? String(b.date) : null,
        notes: b.notes != null ? String(b.notes) : null,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[supporters POST]", e);
    return nextJsonError();
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { id: contactId } = await Promise.resolve(context.params);
    const sid = request.nextUrl.searchParams.get("id");
    if (!sid) {
      return NextResponse.json({ error: "id" }, { status: 400 });
    }
    const { error } = await supabase
      .from("supporters")
      .delete()
      .eq("id", sid)
      .eq("contact_id", contactId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[supporters DELETE]", e);
    return nextJsonError();
  }
}
