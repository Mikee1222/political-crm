import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
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

async function enrichNote(row: NoteRow) {
  const nameMap = await resolveProfileNames([row.user_id, row.deleted_by, row.edited_by]);
  const stored = row.author_name?.trim();
  return {
    ...row,
    author_name: stored || null,
    author_full_name: stored || (row.user_id ? (nameMap.get(row.user_id) ?? "—") : "—"),
    deleted_by_name: row.deleted_by ? (nameMap.get(row.deleted_by) ?? "—") : null,
    edited_by_name: row.edited_by ? (nameMap.get(row.edited_by) ?? "—") : null,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; noteId: string } },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;

    const { data: row, error: fErr } = await supabase
      .from("contact_notes")
      .select(NOTE_COLS)
      .eq("id", params.noteId)
      .eq("contact_id", params.id)
      .maybeSingle();
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const existing = row as NoteRow;
    if (existing.deleted_at) {
      return NextResponse.json({ error: "Η σημείωση έχει διαγραφεί" }, { status: 400 });
    }

    const isAuthor = existing.user_id === user.id;
    const isManager = hasMinRole(profile?.role, "manager", profile?.access_tier);
    if (!isAuthor && !isManager) {
      return forbidden();
    }

    const b = (await request.json()) as { content?: string };
    const content = String(b.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "Κενό περιεχόμενο" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      content,
      updated_at: now,
      edited_at: now,
      edited_by: user.id,
    };
    if (existing.original_content == null) {
      patch.original_content = existing.content;
    }

    const { data: updated, error: uErr } = await supabase
      .from("contact_notes")
      .update(patch)
      .eq("id", params.noteId)
      .eq("contact_id", params.id)
      .select(NOTE_COLS)
      .single();
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 });
    }

    await supabase
      .from("contacts")
      .update({ updated_at: now, updated_by: user.id })
      .eq("id", params.id);

    return NextResponse.json({ note: await enrichNote(updated as NoteRow) });
  } catch (e) {
    console.error("[api/contacts/notes/noteId PATCH]", e);
    return nextJsonError();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; noteId: string } },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    // Secretaries/callers can add notes but only manager+ can delete.
    if (!hasMinRole(profile?.role, "manager", profile?.access_tier)) {
      return forbidden();
    }
    const { data: row, error: fErr } = await supabase
      .from("contact_notes")
      .select("id, user_id, contact_id, deleted_at")
      .eq("id", params.noteId)
      .eq("contact_id", params.id)
      .maybeSingle();
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    if ((row as { deleted_at: string | null }).deleted_at) {
      return NextResponse.json({ ok: true });
    }
    const now = new Date().toISOString();
    const { data: updated, error: dErr } = await supabase
      .from("contact_notes")
      .update({ deleted_at: now, deleted_by: user.id, updated_at: now })
      .eq("id", params.noteId)
      .eq("contact_id", params.id)
      .select(NOTE_COLS)
      .single();
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, note: await enrichNote(updated as NoteRow) });
  } catch (e) {
    console.error("[api/contacts/notes/noteId DELETE]", e);
    return nextJsonError();
  }
}
