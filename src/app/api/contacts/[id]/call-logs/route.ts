import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { resolveContactId } from "@/lib/resolve-entity-id";
import { forbidden } from "@/lib/auth-helpers";
import {
  cleanupStuckPendingCalls,
  PENDING_ADMIN_CLEANUP_MS,
  PENDING_AUTO_CLEANUP_MS,
} from "@/lib/pending-call-cleanup";

export const dynamic = "force-dynamic";

const MARKED_CALL_STATUS = "Επικοινώνησε";

type ContactCommRow = {
  id: string;
  last_contacted_at: string | null;
  last_contacted_by: string | null;
  first_name?: string;
  last_name?: string;
};

type CallRow = {
  id: string;
  contact_id: string;
  campaign_id: string | null;
  called_at: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  notes: string | null;
  campaigns?: { id: string; name: string } | { id: string; name: string }[] | null;
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

function mapCallRow(row: CallRow) {
  const camp = row.campaigns;
  const campaign = Array.isArray(camp) ? camp[0] ?? null : camp ?? null;
  return {
    id: row.id,
    contact_id: row.contact_id,
    campaign_id: row.campaign_id,
    campaign_name: campaign?.name ?? null,
    called_at: row.called_at,
    duration_seconds: row.duration_seconds,
    outcome: row.outcome,
    notes: row.notes,
    transcript: row.notes,
  };
}

async function fetchContactCalls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contactId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("calls")
    .select(
      "id, contact_id, campaign_id, called_at, duration_seconds, outcome, notes, campaigns ( id, name )",
    )
    .eq("contact_id", contactId)
    .order("called_at", { ascending: false });
  const { data, error } = await q;
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as CallRow[]).map(mapCallRow);
}

/** GET — call history (+ auto-cleanup Pending/Αναμονή older than 2h) and mark-contacted log. */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const contactId = await resolveContactId(supabase, params.id);
    if (!contactId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    let cleaned_pending = 0;
    let contact_call_status_updated = false;
    try {
      const cleaned = await cleanupStuckPendingCalls(
        supabase,
        contactId,
        PENDING_AUTO_CLEANUP_MS,
      );
      cleaned_pending = cleaned.cleaned;
      contact_call_status_updated = cleaned.contactCallStatusUpdated;
    } catch (e) {
      console.warn("[api/contacts/call-logs GET] auto-cleanup failed:", e);
    }

    const { data: row, error } = await supabase
      .from("contacts")
      .select("id, last_contacted_at, last_contacted_by, call_status")
      .eq("id", contactId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const log = row ? contactToLog(row as ContactCommRow) : null;
    const calls = await fetchContactCalls(supabase, contactId);

    return NextResponse.json({
      logs: log ? [log] : [],
      calls,
      cleaned_pending,
      contact_call_status_updated,
      call_status: (row as { call_status?: string | null } | null)?.call_status ?? null,
    });
  } catch (e) {
    console.error("[api/contacts/call-logs GET]", e);
    return nextJsonError();
  }
}

/** POST — mark contacted (default) or `{ action: "cleanup_pending" }` (admin, >1h). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    const contactId = await resolveContactId(supabase, params.id);
    if (!contactId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    let body: { action?: string } = {};
    try {
      const raw = await request.text();
      if (raw.trim()) body = JSON.parse(raw) as { action?: string };
    } catch {
      body = {};
    }

    if (body.action === "cleanup_pending") {
      if (profile?.role !== "admin") {
        return forbidden();
      }
      const result = await cleanupStuckPendingCalls(
        supabase,
        contactId,
        PENDING_ADMIN_CLEANUP_MS,
      );
      const calls = await fetchContactCalls(supabase, contactId);
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, call_status")
        .eq("id", contactId)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        cleaned: result.cleaned,
        callIds: result.callIds,
        contact_call_status_updated: result.contactCallStatusUpdated,
        calls,
        call_status: (contact as { call_status?: string | null } | null)?.call_status ?? null,
      });
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

/** PATCH — admin cleanup of stuck Pending/Αναμονή older than 1h. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }

    const contactId = await resolveContactId(supabase, params.id);
    if (!contactId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    let body: { action?: string } = {};
    try {
      body = (await request.json()) as { action?: string };
    } catch {
      body = {};
    }
    if (body.action && body.action !== "cleanup_pending") {
      return NextResponse.json({ error: "Άγνωστη ενέργεια" }, { status: 400 });
    }

    const result = await cleanupStuckPendingCalls(
      supabase,
      contactId,
      PENDING_ADMIN_CLEANUP_MS,
    );
    const calls = await fetchContactCalls(supabase, contactId);
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, call_status")
      .eq("id", contactId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      cleaned: result.cleaned,
      callIds: result.callIds,
      contact_call_status_updated: result.contactCallStatusUpdated,
      calls,
      call_status: (contact as { call_status?: string | null } | null)?.call_status ?? null,
    });
  } catch (e) {
    console.error("[api/contacts/call-logs PATCH]", e);
    return nextJsonError();
  }
}
