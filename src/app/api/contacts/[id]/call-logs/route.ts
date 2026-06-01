import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { resolveProfileNames } from "@/lib/profile-names";

export const dynamic = "force-dynamic";

type CallLogRow = {
  id: string;
  contact_id: string;
  contacted_at: string;
  marked_by_user_id: string | null;
  marked_by_name: string | null;
  created_at: string;
};

function enrichLog(row: CallLogRow, nameMap: Map<string, string | null>) {
  const stored = row.marked_by_name?.trim();
  const uid = row.marked_by_user_id;
  const markerName = stored || (uid ? (nameMap.get(uid) ?? null) : null);
  return {
    ...row,
    marked_by_name: stored || null,
    marker_name: markerName,
  };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { data: rows, error } = await supabase
      .from("contact_call_logs")
      .select("id, contact_id, contacted_at, marked_by_user_id, marked_by_name, created_at")
      .eq("contact_id", params.id)
      .order("contacted_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const list = (rows ?? []) as CallLogRow[];
    const nameMap = await resolveProfileNames(list.map((r) => r.marked_by_user_id));
    return NextResponse.json({ logs: list.map((r) => enrichLog(r, nameMap)) });
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
    const now = new Date().toISOString();
    const markerName = profile?.full_name?.trim() || null;

    const { data: row, error: insErr } = await supabase
      .from("contact_call_logs")
      .insert({
        contact_id: params.id,
        contacted_at: now,
        marked_by_user_id: user.id,
        marked_by_name: markerName,
      })
      .select("id, contact_id, contacted_at, marked_by_user_id, marked_by_name, created_at")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    const { data: contact, error: upErr } = await supabase
      .from("contacts")
      .update({ last_contacted_at: now, updated_at: now, updated_by: user.id })
      .eq("id", params.id)
      .select("id, first_name, last_name, last_contacted_at")
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
      entityId: params.id,
      entityName,
      details: {
        actor_name: firstNameFromFull(profile?.full_name),
        marked_contacted: true,
      },
    });

    const log = row as CallLogRow;
    return NextResponse.json({
      log: enrichLog(log, new Map([[user.id, markerName]])),
      contact: contact as { id: string; last_contacted_at: string | null },
    });
  } catch (e) {
    console.error("[api/contacts/call-logs POST]", e);
    return nextJsonError();
  }
}
