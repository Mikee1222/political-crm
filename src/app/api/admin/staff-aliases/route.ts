import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import {
  fetchStaffAliasesWithProfiles,
  fetchUnlinkedLegacyNames,
  type StaffAlias,
} from "@/lib/staff-aliases";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const [{ aliases, profiles }, unlinked] = await Promise.all([
      fetchStaffAliasesWithProfiles(supabase),
      fetchUnlinkedLegacyNames(supabase, 50),
    ]);
    return NextResponse.json({ aliases, profiles, unlinked });
  } catch (e) {
    console.error("[api/admin/staff-aliases GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as { profile_id?: string; alias_name?: string };
    const profileId = String(body.profile_id ?? "").trim();
    const aliasName = String(body.alias_name ?? "").trim();
    if (!profileId) {
      return NextResponse.json({ error: "Απαιτείται προφίλ" }, { status: 400 });
    }
    if (!aliasName) {
      return NextResponse.json({ error: "Απαιτείται όνομα alias" }, { status: 400 });
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", profileId)
      .eq("is_portal", false)
      .maybeSingle();
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }
    if (!prof) {
      return NextResponse.json({ error: "Μη έγκυρο προφίλ CRM" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("staff_aliases")
      .insert({ profile_id: profileId, alias_name: aliasName })
      .select("id, profile_id, alias_name, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const alias: StaffAlias = {
      ...(data as StaffAlias),
      profile_full_name: (prof as { full_name: string | null }).full_name,
    };
    return NextResponse.json({ alias });
  } catch (e) {
    console.error("[api/admin/staff-aliases POST]", e);
    return nextJsonError();
  }
}
