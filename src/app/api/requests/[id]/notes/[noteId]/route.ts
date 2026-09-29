import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { resolveProfileNames } from "@/lib/profile-names";
import { resolveRequestId } from "@/lib/resolve-entity-id";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; noteId: string } },
) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;

    const requestId = await resolveRequestId(supabase, params.id);
    if (!requestId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const { data: row, error: fErr } = await supabase
      .from("request_notes")
      .select("id, user_id, request_id, content, created_at, updated_at, author_name")
      .eq("id", params.noteId)
      .eq("request_id", requestId)
      .maybeSingle();
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const isAuthor = (row as { user_id: string | null }).user_id === user.id;
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
    const { data: updated, error: uErr } = await supabase
      .from("request_notes")
      .update({ content, updated_at: now })
      .eq("id", params.noteId)
      .eq("request_id", requestId)
      .select("id, request_id, user_id, content, created_at, updated_at, author_name")
      .single();
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 });
    }

    const r = updated as {
      id: string;
      user_id: string | null;
      content: string;
      created_at: string;
      updated_at: string | null;
      author_name: string | null;
    };
    const nameMap = await resolveProfileNames([r.user_id]);
    const stored = r.author_name?.trim();
    return NextResponse.json({
      note: {
        ...r,
        author_name: stored || null,
        author_full_name: stored || (r.user_id ? (nameMap.get(r.user_id) ?? "—") : "—"),
      },
    });
  } catch (e) {
    console.error("[api/requests/notes/noteId PATCH]", e);
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
    const { profile, supabase } = crm;
    // Secretaries/callers can add notes but only manager+ can delete.
    if (!hasMinRole(profile?.role, "manager", profile?.access_tier)) {
      return forbidden();
    }

    const requestId = await resolveRequestId(supabase, params.id);
    if (!requestId) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }

    const { data: row, error: fErr } = await supabase
      .from("request_notes")
      .select("id, user_id, request_id")
      .eq("id", params.noteId)
      .eq("request_id", requestId)
      .maybeSingle();
    if (fErr) {
      return NextResponse.json({ error: fErr.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const { error: dErr } = await supabase.from("request_notes").delete().eq("id", params.noteId);
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/requests/notes/noteId DELETE]", e);
    return nextJsonError();
  }
}
