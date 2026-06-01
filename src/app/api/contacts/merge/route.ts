import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { stablePairId } from "@/lib/duplicate-detection";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const EP_CODE = /^EP-\d+$/i;

async function resolveContactId(
  supabase: SupabaseClient,
  idOrCode: string,
): Promise<{ id: string; label: string } | null> {
  const raw = idOrCode.trim();
  if (!raw) return null;
  if (EP_CODE.test(raw)) {
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, contact_code")
      .eq("contact_code", raw.toUpperCase())
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; first_name: string; last_name: string; contact_code: string | null };
    return {
      id: row.id,
      label: `${row.first_name} ${row.last_name}`.trim() || row.contact_code || row.id,
    };
  }
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, contact_code")
    .eq("id", raw)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; first_name: string; last_name: string; contact_code: string | null };
  return {
    id: row.id,
    label: `${row.first_name} ${row.last_name}`.trim() || row.contact_code || row.id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as { primary_id?: string; secondary_id?: string };
    const primaryRaw = String(body.primary_id ?? "").trim();
    const secondaryRaw = String(body.secondary_id ?? "").trim();
    if (!primaryRaw || !secondaryRaw) {
      return NextResponse.json({ error: "Απαιτούνται primary_id και secondary_id" }, { status: 400 });
    }

    const primary = await resolveContactId(supabase, primaryRaw);
    const secondary = await resolveContactId(supabase, secondaryRaw);
    if (!primary || !secondary) {
      return NextResponse.json({ error: "Η επαφή δεν βρέθηκε" }, { status: 400 });
    }
    if (primary.id === secondary.id) {
      return NextResponse.json({ error: "Οι δύο επαφές είναι ίδιες" }, { status: 400 });
    }

    const keepId = primary.id;
    const mergeId = secondary.id;

    const { data: keep, error: e1 } = await supabase.from("contacts").select("*").eq("id", keepId).single();
    const { data: merge, error: e2 } = await supabase.from("contacts").select("*").eq("id", mergeId).single();
    if (e1 || e2 || !keep || !merge) {
      return NextResponse.json({ error: "Η επαφή δεν βρέθηκε" }, { status: 400 });
    }

    const { error: notesErr } = await supabase
      .from("contact_notes")
      .update({ contact_id: keepId })
      .eq("contact_id", mergeId);
    if (notesErr) return NextResponse.json({ error: notesErr.message }, { status: 400 });

    const { error: reqErr } = await supabase
      .from("requests")
      .update({ contact_id: keepId })
      .eq("contact_id", mergeId);
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 400 });

    const { error: reqAffErr } = await supabase
      .from("requests")
      .update({ affected_contact_id: keepId })
      .eq("affected_contact_id", mergeId);
    if (reqAffErr) return NextResponse.json({ error: reqAffErr.message }, { status: 400 });

    await supabase.from("request_persons").update({ contact_id: keepId }).eq("contact_id", mergeId);

    const { data: mergeGroups } = await supabase
      .from("contact_group_members")
      .select("group_id")
      .eq("contact_id", mergeId);
    const { data: keepGroups } = await supabase
      .from("contact_group_members")
      .select("group_id")
      .eq("contact_id", keepId);
    const keepSet = new Set((keepGroups ?? []).map((g) => (g as { group_id: string }).group_id));
    for (const row of mergeGroups ?? []) {
      const gid = (row as { group_id: string }).group_id;
      if (!keepSet.has(gid)) {
        await supabase.from("contact_group_members").insert({ contact_id: keepId, group_id: gid });
        keepSet.add(gid);
      }
    }
    await supabase.from("contact_group_members").delete().eq("contact_id", mergeId);

    const { data: relationsToMerge } = await supabase
      .from("contact_relations")
      .select("id, contact_id_1, contact_id_2, relation_type")
      .or(`contact_id_1.eq.${mergeId},contact_id_2.eq.${mergeId}`);
    for (const rel of relationsToMerge ?? []) {
      const r = rel as {
        contact_id_1: string;
        contact_id_2: string;
        relation_type: string | null;
      };
      const otherId = r.contact_id_1 === mergeId ? r.contact_id_2 : r.contact_id_1;
      if (otherId === keepId) continue;
      const { small, big } = stablePairId(keepId, otherId);
      await supabase.from("contact_relations").upsert(
        {
          contact_id_1: small,
          contact_id_2: big,
          relation_type: r.relation_type,
        },
        { onConflict: "contact_id_1,contact_id_2", ignoreDuplicates: true },
      );
    }
    await supabase
      .from("contact_relations")
      .delete()
      .or(`contact_id_1.eq.${mergeId},contact_id_2.eq.${mergeId}`);

    await supabase.from("calls").update({ contact_id: keepId }).eq("contact_id", mergeId);
    await supabase.from("tasks").update({ contact_id: keepId }).eq("contact_id", mergeId);

    const parts = [keep.notes, merge.notes].filter(Boolean) as string[];
    const mergedNotes = parts.length ? parts.join("\n\n---\n\n") : null;
    const tagSet = new Set([
      ...(Array.isArray(keep.tags) ? keep.tags : []),
      ...(Array.isArray(merge.tags) ? merge.tags : []),
    ]);

    const { error: uErr } = await supabase
      .from("contacts")
      .update({
        notes: mergedNotes,
        tags: tagSet.size ? Array.from(tagSet) : keep.tags,
      })
      .eq("id", keepId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

    const { error: dErr } = await supabase.from("contacts").delete().eq("id", mergeId);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    const actor = firstNameFromFull(profile?.full_name);
    await logActivity({
      userId: user.id,
      action: "contact_updated",
      entityType: "contact",
      entityId: keepId,
      entityName: primary.label,
      details: {
        actor_name: actor,
        merged_contact_id: mergeId,
        merged_contact_label: secondary.label,
        action: "contact_merge",
      },
    });

    return NextResponse.json({ ok: true, contact: { id: keepId } });
  } catch (e) {
    console.error("[api/contacts/merge POST]", e);
    return nextJsonError();
  }
}
