import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { normalizeGreekName, normalizePhoneForMatch } from "@/lib/duplicate-detection";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const url = request.nextUrl;
    const phone = url.searchParams.get("phone")?.trim() ?? "";
    const first_name = url.searchParams.get("first_name")?.trim() ?? "";
    const last_name = url.searchParams.get("last_name")?.trim() ?? "";
    const excludeId = url.searchParams.get("excludeId");

    const { data: all, error } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, municipality, area");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (all ?? []).filter((c) => !excludeId || c.id !== excludeId);
    const normP = normalizePhoneForMatch(phone);
    const nf = normalizeGreekName(first_name);
    const nl = normalizeGreekName(last_name);

    let phoneMatch: { id: string; name: string } | null = null;
    if (normP) {
      for (const c of rows) {
        if (normalizePhoneForMatch(c.phone) === normP) {
          phoneMatch = { id: c.id, name: `${c.first_name} ${c.last_name}`.trim() };
          break;
        }
      }
    }

    let nameMatch: { id: string; name: string } | null = null;
    if (nf && nl) {
      for (const c of rows) {
        if (normalizeGreekName(c.first_name) === nf && normalizeGreekName(c.last_name) === nl) {
          nameMatch = { id: c.id, name: `${c.first_name} ${c.last_name}`.trim() };
          break;
        }
      }
    }

    if (phoneMatch && nameMatch && phoneMatch.id === nameMatch.id) {
      return NextResponse.json({ phoneMatch, nameMatch: null });
    }

    return NextResponse.json({ phoneMatch, nameMatch });
  } catch (e) {
    console.error("[api/contacts/precheck]", e);
    return nextJsonError();
  }
}
