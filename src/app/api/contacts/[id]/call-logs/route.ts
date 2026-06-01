import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { resolveContactId } from "@/lib/resolve-entity-id";

export const dynamic = "force-dynamic";

const MARKED_CALL_STATUS = "Επικοινώνησε";

type ContactCommRow = {
  id: string;
  last_contacted_at: string | null;
  last_contacted_by: string | null;
  first_name?: string;
  last_name?: string;
};

function contactToLog(row: ContactCommRow) {
  const at = row.last_contacted_at;
  if (!at) return null;
  const marker = row.last_contacted_by?.trim() || null;
  return {
    id: row.id,
    contact_id: row.id,
    called_at: at,
    marked_by_user_id: null,
    marked_by_name: marker,
    marker_name: marker,
  };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const contactId = await resolveContactId(supabase, params.id);
    if (!contactId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const { data: row, error } = await supabase
      .from("contacts")
      .select("id, last_contacted_at, last_contacted_by")
      .eq("id", contactId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const log = row ? contactToLog(row as ContactCommRow) : null;
    return NextResponse.json({ logs: log ? [log] : [] });
  } catch (e) {
    console.error("[api/contacts/call-logs GET]", e);
    return nextJsonError();
  }
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    const contactId = await resolveContactId(supabase, params.id);
    if (!contactId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const now = new Date().toISOString();
    const markerName = profile?.full_name?.trim() || null;

    const { data: contact, error: upErr } = await supabase
      .from("contacts")
      .update({
        last_contacted_at: now,
        last_contacted_by: markerName,
        call_status: MARKED_CALL_STATUS,
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", contactId)
      .select("id, first_name, last_name, last_contacted_at, last_contacted_by, call_status")
      .single();
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    const entityName = contact
      ? `${String((contact as { first_name: string }).first_name)} ${String((contact as { last_name: string }).last_name)}`.trim()
      : "Επαφή";
    await logActivity({
      userId: user.id,
      action: "contact_updated",
      entityType: "contact",
      entityId: contactId,
      entityName,
      details: {
        actor_name: firstNameFromFull(profile?.full_name),
        marked_contacted: true,
      },
    });

    const log = contactToLog(contact as ContactCommRow);
    return NextResponse.json({
      log,
      contact: contact as {
        id: string;
        last_contacted_at: string | null;
        last_contacted_by: string | null;
        call_status: string | null;
      },
    });
  } catch (e) {
    console.error("[api/contacts/call-logs POST]", e);
    return nextJsonError();
  }
}
