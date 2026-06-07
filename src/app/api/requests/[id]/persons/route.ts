import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { resolveContactId, resolveRequestId } from "@/lib/resolve-entity-id";

export const dynamic = "force-dynamic";

const ROLES = new Set(["requester", "affected", "helper", "handler"]);

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as { contact_id?: string; role?: string };
    const role = String(body.role ?? "").trim();
    if (!ROLES.has(role)) {
      return NextResponse.json({ error: "Άκυρα στοιχεία" }, { status: 400 });
    }

    const requestId = await resolveRequestId(supabase, params.id);
    if (!requestId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const contactId = await resolveContactId(supabase, String(body.contact_id ?? "").trim());
    if (!contactId) {
      return NextResponse.json({ error: "Άκυρη επαφή" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("request_persons")
      .insert({ request_id: requestId, contact_id: contactId, role })
      .select("id, request_id, contact_id, role, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (role === "requester") {
      await supabase.from("requests").update({ contact_id: contactId }).eq("id", requestId);
    } else if (role === "affected") {
      await supabase.from("requests").update({ affected_contact_id: contactId }).eq("id", requestId);
    }

    return NextResponse.json({ person: data });
  } catch (e) {
    console.error("[api/requests/id/persons POST]", e);
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

    const contactRaw = request.nextUrl.searchParams.get("contact_id")?.trim() ?? "";
    const role = request.nextUrl.searchParams.get("role")?.trim() ?? "";
    if (!contactRaw || !ROLES.has(role)) {
      return NextResponse.json({ error: "Άκυρα στοιχεία" }, { status: 400 });
    }

    const requestId = await resolveRequestId(supabase, params.id);
    if (!requestId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const contactId = await resolveContactId(supabase, contactRaw);
    if (!contactId) {
      return NextResponse.json({ error: "Άκυρη επαφή" }, { status: 400 });
    }

    const { error } = await supabase
      .from("request_persons")
      .delete()
      .eq("request_id", requestId)
      .eq("contact_id", contactId)
      .eq("role", role);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/requests/id/persons DELETE]", e);
    return nextJsonError();
  }
}
