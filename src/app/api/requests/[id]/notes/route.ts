import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { resolveProfileNames } from "@/lib/profile-names";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { logActivity } from "@/lib/activity-log";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const { data: rows, error } = await supabase
      .from("request_notes")
      .select("id, request_id, user_id, content, created_at")
      .eq("request_id", params.id)
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
    console.error("[api/requests/notes GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const b = (await request.json()) as { content?: string };
    const content = String(b.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ error: "Κενό περιεχόμενο" }, { status: 400 });
    }
    const { data: row, error: insErr } = await supabase
      .from("request_notes")
      .insert({ request_id: params.id, user_id: user.id, content })
      .select("id, request_id, user_id, content, created_at")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
    const nameMap = await resolveProfileNames([user.id]);
    const r = row as { id: string; user_id: string | null; content: string; created_at: string };
    const note = {
      ...r,
      author_full_name: nameMap.get(user.id) ?? profile?.full_name?.trim() ?? "—",
    };
    const { data: reqRow } = await supabase.from("requests").select("title, request_code").eq("id", params.id).single();
    const title = String((reqRow as { title?: string; request_code?: string } | null)?.title ?? "Αίτημα");
    await logActivity({
      userId: user.id,
      action: "request_note_added",
      entityType: "request",
      entityId: params.id,
      entityName: title,
      details: { actor_name: firstNameFromFull(profile?.full_name) },
    });
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[api/requests/notes POST]", e);
    return nextJsonError();
  }
}
