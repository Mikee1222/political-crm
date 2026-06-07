import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { isUuid, resolveRequestId } from "@/lib/resolve-entity-id";

export const dynamic = "force-dynamic";

async function syncLegacyContactColumn(
  supabase: SupabaseClient,
  requestId: string,
  role: "requester" | "affected",
  removedContactId: string,
) {
  const column = role === "requester" ? "contact_id" : "affected_contact_id";
  const { data: req } = await supabase.from("requests").select(column).eq("id", requestId).single();
  if (!req) return;
  const current = String((req as Record<string, string | null>)[column] ?? "");
  if (current !== removedContactId) return;

  const { data: next } = await supabase
    .from("request_persons")
    .select("contact_id")
    .eq("request_id", requestId)
    .eq("role", role)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("requests")
    .update({ [column]: next ? (next as { contact_id: string }).contact_id : null })
    .eq("id", requestId);
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; personId: string } },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const requestId = await resolveRequestId(supabase, params.id);
    if (!requestId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const personId = params.personId?.trim() ?? "";
    if (!isUuid(personId)) {
      return NextResponse.json({ error: "Άκυρα στοιχεία" }, { status: 400 });
    }

    const { data: person, error: fetchErr } = await supabase
      .from("request_persons")
      .select("id, role, contact_id")
      .eq("id", personId)
      .eq("request_id", requestId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    }
    if (!person) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const { error } = await supabase
      .from("request_persons")
      .delete()
      .eq("id", personId)
      .eq("request_id", requestId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const role = String(person.role);
    const contactId = String(person.contact_id);
    if (role === "requester" || role === "affected") {
      await syncLegacyContactColumn(supabase, requestId, role, contactId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/requests/id/persons/personId DELETE]", e);
    return nextJsonError();
  }
}
