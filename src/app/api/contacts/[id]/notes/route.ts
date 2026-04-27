import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { resolveProfileNames } from "@/lib/profile-names";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { data: rows, error } = await supabase
      .from("contact_notes")
      .select("id, contact_id, user_id, content, created_at")
      .eq("contact_id", params.id)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const list = rows ?? [];
    const nameMap = await resolveProfileNames(list.map((r) => (r as { user_id: string | null }).user_id));
    const notes = list.map((r) => {
      const row = r as { id: string; user_id: string | null; content: string; created_at: string };
      return {
        ...row,
        author_full_name: row.user_id ? (nameMap.get(row.user_id) ?? "—") : "—",
      };
    });
    return NextResponse.json({ notes });
  } catch (e) {
    console.error("[api/contacts/notes GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const b = (await request.json()) as { content?: string };
    const content = String(b.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "Κενό περιεχόμενο" }, { status: 400 });
    }
    const { data: row, error: insErr } = await supabase
      .from("contact_notes")
      .insert({ contact_id: params.id, user_id: user.id, content })
      .select("id, contact_id, user_id, content, created_at")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
    await supabase
      .from("contacts")
      .update({ updated_at: new Date().toISOString(), updated_by: user.id })
      .eq("id", params.id);

    const { data: contact } = await supabase.from("contacts").select("first_name, last_name").eq("id", params.id).single();
    const entityName = contact
      ? `${String((contact as { first_name: string }).first_name)} ${String((contact as { last_name: string }).last_name)}`.trim()
      : "Επαφή";
    await logActivity({
      userId: user.id,
      action: "contact_note_added",
      entityType: "contact",
      entityId: params.id,
      entityName,
      details: { actor_name: firstNameFromFull(profile?.full_name) },
    });

    const nameMap = await resolveProfileNames([(row as { user_id: string | null }).user_id]);
    const uid = (row as { user_id: string | null }).user_id;
    return NextResponse.json({
      note: {
        ...(row as object),
        author_full_name: uid ? (nameMap.get(uid) ?? "—") : "—",
      },
    });
  } catch (e) {
    console.error("[api/contacts/notes POST]", e);
    return nextJsonError();
  }
}
