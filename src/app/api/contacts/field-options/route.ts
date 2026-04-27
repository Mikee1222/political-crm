import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
export const dynamic = 'force-dynamic';

/**
 * Unique area / municipality values for filter dropdowns (manager convenience).
 */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
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
