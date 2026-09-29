import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { resolveProfileNames } from "@/lib/profile-names";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { logActivity } from "@/lib/activity-log";
import { resolveRequestId } from "@/lib/resolve-entity-id";

export const dynamic = "force-dynamic";

const NOTE_COLS =
  "id, request_id, user_id, content, created_at, updated_at, author_name, deleted_at, deleted_by, original_content, edited_at, edited_by";

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
    const requestId = await resolveRequestId(supabase, params.id);
    if (!requestId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const { data: rows, error } = await supabase
      .from("request_notes")
      .select(NOTE_COLS)
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const notes = await enrichNotes((rows ?? []) as NoteRow[]);
    return NextResponse.json({ notes });
  } catch (e) {
    console.error("[api/requests/notes GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    // Callers / γραμματείς may add notes; delete stays manager+.
    if (!hasMinRole(profile?.role, "caller", profile?.access_tier)) {
      return forbidden();
    }
    const b = (await request.json()) as { content?: string };
    const content = String(b.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "Κενό περιεχόμενο" }, { status: 400 });
    }
    const requestId = await resolveRequestId(supabase, params.id);
    if (!requestId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const { data: row, error: insErr } = await supabase
      .from("request_notes")
      .insert({
        request_id: requestId,
        user_id: user.id,
        content,
        author_name: profile?.full_name?.trim() || null,
      })
      .select(NOTE_COLS)
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
    const [note] = await enrichNotes([row as NoteRow]);
    const { data: reqRow } = await supabase.from("requests").select("title, request_code").eq("id", requestId).single();
    const title = String((reqRow as { title?: string; request_code?: string } | null)?.title ?? "Αίτημα");
    await logActivity({
      userId: user.id,
      action: "request_note_added",
      entityType: "request",
      entityId: requestId,
      entityName: title,
      details: { actor_name: firstNameFromFull(profile?.full_name) },
    });
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[api/requests/notes POST]", e);
    return nextJsonError();
  }
}
