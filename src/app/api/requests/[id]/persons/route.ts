import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

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
    const contactId = String(body.contact_id ?? "").trim();
    const role = String(body.role ?? "").trim();
    if (!contactId || !ROLES.has(role)) {
      return NextResponse.json({ error: "Άκυρα στοιχεία" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("request_persons")
      .insert({ request_id: params.id, contact_id: contactId, role })
      .select("id, request_id, contact_id, role, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (role === "requester") {
      await supabase.from("requests").update({ contact_id: contactId }).eq("id", params.id);
    } else if (role === "affected") {
      await supabase.from("requests").update({ affected_contact_id: contactId }).eq("id", params.id);
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

    const contactId = request.nextUrl.searchParams.get("contact_id")?.trim() ?? "";
    const role = request.nextUrl.searchParams.get("role")?.trim() ?? "";
    if (!contactId || !ROLES.has(role)) {
      return NextResponse.json({ error: "Άκυρα στοιχεία" }, { status: 400 });
    }

    const { error } = await supabase
      .from("request_persons")
      .delete()
      .eq("request_id", params.id)
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
