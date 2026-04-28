import { checkCRMAccess } from "@/lib/crm-api-access";
import { forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

export async function GET(_: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") return forbidden();

    const { role: roleName } = await params;
    const role = decodeURIComponent(roleName);

    const admin = createServiceClient();
    const { data: exists } = await admin.from("roles").select("name").eq("name", role).maybeSingle();
    if (!exists) {
      return NextResponse.json({ error: "Άγνωστος ρόλος" }, { status: 404 });
    }

    const { data: rows, error } = await admin.from("role_permissions").select("permission_key, allowed").eq("role_name", role);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const permissions: Record<string, boolean> = {};
    for (const k of ALL_PERMISSION_KEYS) permissions[k] = false;
    for (const r of rows ?? []) {
      permissions[r.permission_key as string] = Boolean(r.allowed);
    }
    return NextResponse.json({ role, permissions });
  } catch (e) {
    console.error("[api/admin/roles/role/permissions GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ role: string }> }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") return forbidden();

    const { role: roleName } = await params;
    const role = decodeURIComponent(roleName);

    const body = (await request.json()) as { permissions?: Record<string, boolean> };
    if (!body.permissions || typeof body.permissions !== "object") {
      return NextResponse.json({ error: "Χρειάζεται permissions" }, { status: 400 });
    }

    const admin = createServiceClient();
    const { data: exists } = await admin.from("roles").select("name").eq("name", role).maybeSingle();
    if (!exists) {
      return NextResponse.json({ error: "Άγνωστος ρόλος" }, { status: 404 });
    }

    const upserts: { role_name: string; permission_key: string; allowed: boolean }[] = [];
    for (const [k, v] of Object.entries(body.permissions)) {
      if (!KEY_SET.has(k)) continue;
      upserts.push({ role_name: role, permission_key: k, allowed: Boolean(v) });
    }

    if (upserts.length === 0) {
      return NextResponse.json({ error: "Κανένα έγκυρο κλειδί" }, { status: 400 });
    }

    const { error } = await admin.from("role_permissions").upsert(upserts, { onConflict: "role_name,permission_key" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/roles/role/permissions PUT]", e);
    return nextJsonError();
  }
}
