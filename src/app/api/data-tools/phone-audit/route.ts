import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { normalizePhoneForMatch } from "@/lib/duplicate-detection";
import { analyzeGreekPhone, problemLabelGreek } from "@/lib/phone-validation";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

type C = { id: string; first_name: string; last_name: string; phone: string | null };

export async function GET() {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const { data: raw, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const all = (raw ?? []) as C[];
  const empty: C[] = [];
  const invalid: Array<C & { problem: string }> = [];
  const byNorm = new Map<string, C[]>();

  for (const c of all) {
    const p = c.phone;
    if (p == null || !String(p).trim()) {
      empty.push(c);
      continue;
    }
    const a = analyzeGreekPhone(p);
    if (!a.valid && a.problem) {
      invalid.push({ ...c, problem: problemLabelGreek(a.problem) });
    }
    const n = normalizePhoneForMatch(p);
    if (n) {
      const list = byNorm.get(n) ?? [];
      list.push(c);
      byNorm.set(n, list);
    }
  }

  const phoneDuplicates: Array<{ normalized: string; contacts: C[] }> = [];
  for (const [k, v] of byNorm) {
    if (v.length >= 2) {
      phoneDuplicates.push({ normalized: k, contacts: v });
    }
  }
  phoneDuplicates.sort((a, b) => b.contacts.length - a.contacts.length);

  return NextResponse.json({ empty, invalid, phoneDuplicates, scanned: all.length });
  } catch (e) {
    console.error("[api/data-tools/phone-audit]", e);
    return nextJsonError();
  }
}
