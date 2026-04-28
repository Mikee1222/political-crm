import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { mergePreferences, type UserPreferences } from "@/lib/user-preferences";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    const { data: row } = await supabase
      .from("profiles")
      .select("full_name, role, avatar_url, preferences, is_portal, theme")
      .eq("id", user.id)
      .maybeSingle();
    const th = (row as { theme?: string } | null)?.theme;
    const roleName = (row?.role as string) ?? profile?.role ?? "caller";
    const permissions: Record<string, boolean> = {};
    for (const k of ALL_PERMISSION_KEYS) permissions[k] = false;
    try {
      const admin = createServiceClient();
      const { data: prow } = await admin
        .from("role_permissions")
        .select("permission_key, allowed")
        .eq("role_name", roleName)
        .eq("allowed", true);
      for (const r of prow ?? []) {
        permissions[r.permission_key as string] = true;
      }
    } catch {
      /* migration not applied — leave all false */
    }
    return NextResponse.json({
      profile: {
        id: user.id,
        full_name: row?.full_name ?? profile?.full_name ?? null,
        role: roleName,
        is_portal: Boolean((row as { is_portal?: boolean } | null)?.is_portal),
        email: user.email ?? null,
        avatar_url: row?.avatar_url ?? profile?.avatar_url ?? null,
        theme: th === "light" || th === "dark" ? th : (th ?? "dark"),
        preferences: mergePreferences(
          (row as { preferences?: UserPreferences } | null)?.preferences ?? null,
          null,
        ),
        permissions,
      },
    });
  } catch (e) {
    console.error("[api/profile GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, supabase } = crm;
    const body = (await request.json()) as {
      full_name?: string | null;
      avatar_url?: string | null;
      theme?: "dark" | "light" | string;
      preferences?: Partial<UserPreferences>;
    };
    const { data: row } = await supabase.from("profiles").select("preferences").eq("id", user.id).maybeSingle();
    const mergedPrefs =
      body.preferences != null
        ? mergePreferences(
            (row as { preferences?: UserPreferences } | null)?.preferences ?? null,
            body.preferences,
          )
        : undefined;
    const patch: Record<string, unknown> = {};
    if (body.full_name !== undefined) patch.full_name = body.full_name;
    if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url;
    if (body.theme === "light" || body.theme === "dark") patch.theme = body.theme;
    if (mergedPrefs) patch.preferences = mergedPrefs;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true });
    }
    const { error } = await supabase.from("profiles").update(patch as never).eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/profile PUT]", e);
    return nextJsonError();
  }
}
