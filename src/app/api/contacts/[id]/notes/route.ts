import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { resolveProfileNames } from "@/lib/profile-names";

export const dynamic = "force-dynamic";

const NOTE_COLS =
  "id, contact_id, user_id, content, created_at, updated_at, author_name, deleted_at, deleted_by, original_content, edited_at, edited_by";

type NoteRow = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  updated_at: string | null;
  author_name: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  original_content: string | null;
  edited_at: string | null;
  edited_by: string | null;
};

async function enrichNotes(list: NoteRow[]) {
  const nameMap = await resolveProfileNames(
    list.flatMap((r) => [r.user_id, r.deleted_by, r.edited_by]),
  );
  return list.map((row) => {
    const stored = row.author_name?.trim();
    return {
      ...row,
      author_name: stored || null,
      author_full_name: stored || (row.user_id ? (nameMap.get(row.user_id) ?? "—") : "—"),
      deleted_by_name: row.deleted_by ? (nameMap.get(row.deleted_by) ?? "—") : null,
      edited_by_name: row.edited_by ? (nameMap.get(row.edited_by) ?? "—") : null,
    };
  });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { data: rows, error } = await supabase
      .from("contact_notes")
      .select(NOTE_COLS)
      .eq("contact_id", params.id)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const notes = await enrichNotes((rows ?? []) as NoteRow[]);
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
    // Callers / γραμματείς may add notes; delete stays manager+ elsewhere.
    if (!hasMinRole(profile?.role, "caller", profile?.access_tier)) {
      return forbidden();
    }
    const b = (await request.json()) as { content?: string };
    const content = String(b.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "Κενό περιεχόμενο" }, { status: 400 });
    }
    const { data: row, error: insErr } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: params.id,
        user_id: user.id,
        content,
        author_name: profile?.full_name?.trim() || null,
      })
      .select(NOTE_COLS)
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

    const [note] = await enrichNotes([row as NoteRow]);
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[api/contacts/notes POST]", e);
    return nextJsonError();
  }
}
