import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = (await request.json()) as { keepId: string; mergeId: string };
  const { keepId, mergeId } = body;
  if (!keepId || !mergeId || keepId === mergeId) {
    return NextResponse.json({ error: "Άκυρα αναγνωριστικά" }, { status: 400 });
  }

  const { data: keep, error: e1 } = await supabase.from("contacts").select("*").eq("id", keepId).single();
  const { data: merge, error: e2 } = await supabase.from("contacts").select("*").eq("id", mergeId).single();
  if (e1 || e2 || !keep || !merge) {
    return NextResponse.json({ error: "Η επαφή δεν βρέθηκε" }, { status: 400 });
  }

  const { error: cErr } = await supabase.from("calls").update({ contact_id: keepId }).eq("contact_id", mergeId);
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 400 });
  }
  const { error: tErr } = await supabase.from("tasks").update({ contact_id: keepId }).eq("contact_id", mergeId);
  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 400 });
  }
  const { error: rErr } = await supabase.from("requests").update({ contact_id: keepId }).eq("contact_id", mergeId);
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 400 });
  }

  const parts = [keep.notes, merge.notes].filter(Boolean) as string[];
  const mergedNotes = parts.length ? parts.join("\n\n---\n\n") : null;
  const tagSet = new Set([...(Array.isArray(keep.tags) ? keep.tags : []), ...(Array.isArray(merge.tags) ? merge.tags : [])]);

  const { error: uErr } = await supabase
    .from("contacts")
    .update({
      notes: mergedNotes,
      tags: tagSet.size ? Array.from(tagSet) : keep.tags,
    })
    .eq("id", keepId);
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 400 });
  }

  const { error: dErr } = await supabase.from("contacts").delete().eq("id", mergeId);
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, contact: { id: keepId } });
  } catch (e) {
    console.error("[api/data-tools/duplicates/merge]", e);
    return nextJsonError();
  }
}
