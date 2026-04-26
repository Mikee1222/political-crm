import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
export const dynamic = 'force-dynamic';

/**
 * Unique area / municipality values for filter dropdowns (manager convenience).
 */
export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase.from("contacts").select("area, municipality");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const areas = new Set<string>();
    const muni = new Set<string>();
    for (const row of data ?? []) {
      const a = (row as { area?: string | null }).area;
      const m = (row as { municipality?: string | null }).municipality;
      if (a) areas.add(a);
      if (m) muni.add(m);
    }
    return NextResponse.json({
      areas: [...areas].sort((a, b) => a.localeCompare(b, "el")),
      municipalities: [...muni].sort((a, b) => a.localeCompare(b, "el")),
    });
  } catch (e) {
    console.error("[api/contacts/field-options]", e);
    return nextJsonError();
  }
}
