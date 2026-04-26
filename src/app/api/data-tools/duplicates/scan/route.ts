import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import {
  pairScoreAndReasons,
  stablePairId,
  type ContactForDedup,
} from "@/lib/duplicate-detection";
import { claudeDuplicateVerdict } from "@/lib/duplicate-claude";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  area: string | null;
  municipality: string | null;
};

export async function POST() {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const { data: contacts, error: e1 } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, area, municipality");
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 400 });
  }

  const { data: dismissed, error: e2 } = await supabase
    .from("dismissed_duplicates")
    .select("contact_id_1, contact_id_2");
  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 400 });
  }

  const { data: relations, error: e3 } = await supabase
    .from("contact_relations")
    .select("contact_id_1, contact_id_2");
  if (e3) {
    return NextResponse.json({ error: e3.message }, { status: 400 });
  }

  const disSet = new Set(
    (dismissed ?? []).map((d) => `${d.contact_id_1}|${d.contact_id_2}`),
  );
  const famSet = new Set(
    (relations ?? []).map((d) => `${d.contact_id_1}|${d.contact_id_2}`),
  );

  const list = (contacts ?? []) as Row[];
  const pairs: Array<{
    contactA: Row;
    contactB: Row;
    score: number;
    reasons: string[];
  }> = [];

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const { small, big } = stablePairId(a.id, b.id);
      const key = `${small}|${big}`;
      if (disSet.has(key) || famSet.has(key)) continue;

      const A: ContactForDedup = a;
      const B: ContactForDedup = b;
      const { score, reasons } = pairScoreAndReasons(A, B);
      if (score < 50) continue;

      pairs.push({
        contactA: a,
        contactB: b,
        score: Math.min(100, score),
        reasons,
      });
    }
  }

  const MAX_AI = 50;
  let aiUsed = 0;
  const refined: typeof pairs = [];
  for (const p of pairs) {
    if (p.score >= 100) {
      refined.push(p);
      continue;
    }
    if (p.score < 50) {
      continue;
    }
    if (aiUsed >= MAX_AI) {
      refined.push(p);
      continue;
    }
    const A: ContactForDedup = p.contactA;
    const B: ContactForDedup = p.contactB;
    const v = await claudeDuplicateVerdict(A, B);
    aiUsed += 1;
    if (v == null) {
      refined.push(p);
      continue;
    }
    if (!v.samePerson) {
      continue;
    }
    refined.push({
      ...p,
      score: Math.max(p.score, v.score),
      reasons: [...p.reasons, "Claude: ίδιο πρόσωπο"],
    });
  }

  refined.sort((x, y) => y.score - x.score);
  return NextResponse.json({ pairs: refined, scanned: list.length, claude_verdicts: aiUsed });
  } catch (e) {
    console.error("[api/data-tools/duplicates/scan]", e);
    return nextJsonError();
  }
}
