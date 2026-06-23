import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";
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
    const admin = createServiceClient();
    const [{ aliases, profiles }, unlinked] = await Promise.all([
      fetchStaffAliasesWithProfiles(admin),
      fetchUnlinkedLegacyNames(supabase, 50),
    ]);
    return NextResponse.json({ aliases, profiles, unlinked });
  } catch (e) {
    console.error("[api/admin/staff-aliases GET]", e);
    return nextJsonError();
  }
}

function normalizeAliasNames(body: {
  alias_name?: string;
  alias_names?: string[];
}): string[] {
  const raw = [
    ...(Array.isArray(body.alias_names) ? body.alias_names : []),
    ...(body.alias_name ? [body.alias_name] : []),
  ];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of raw) {
    const trimmed = String(name).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
  return names;
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      profile_id?: string;
      alias_name?: string;
      alias_names?: string[];
    };
    const profileId = String(body.profile_id ?? "").trim();
    const aliasNames = normalizeAliasNames(body);
    if (!profileId) {
      return NextResponse.json({ error: "Απαιτείται προφίλ" }, { status: 400 });
    }
    if (aliasNames.length === 0) {
      return NextResponse.json({ error: "Απαιτείται τουλάχιστον ένα όνομα alias" }, { status: 400 });
    }

    const admin = createServiceClient();
    const { data: prof, error: profErr } = await admin
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

    const { data: existingRows, error: existingErr } = await admin.from("staff_aliases").select("alias_name");
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 400 });
    }

    const existingLower = new Set(
      (existingRows ?? []).map((row) => String((row as { alias_name: string }).alias_name).toLowerCase()),
    );
    const toInsert = aliasNames.filter((name) => !existingLower.has(name.toLowerCase()));
    const skipped = aliasNames.filter((name) => existingLower.has(name.toLowerCase()));

    if (toInsert.length === 0) {
      return NextResponse.json(
        { error: "Όλα τα επιλεγμένα ονόματα είναι ήδη συνδεδεμένα", skipped },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("staff_aliases")
      .insert(toInsert.map((alias_name) => ({ profile_id: profileId, alias_name })))
      .select("id, profile_id, alias_name, created_at");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const profileFullName = (prof as { full_name: string | null }).full_name;
    const aliases: StaffAlias[] = (data ?? []).map((row) => ({
      ...(row as StaffAlias),
      profile_full_name: profileFullName,
    }));

    return NextResponse.json({
      aliases,
      alias: aliases[0],
      skipped: skipped.length > 0 ? skipped : undefined,
    });
  } catch (e) {
    console.error("[api/admin/staff-aliases POST]", e);
    return nextJsonError();
  }
}
