import { checkCRMAccess } from "@/lib/crm-api-access";
import { forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const NAME_RE = /^[a-z][a-z0-9_]{1,48}$/;

function isAccessTier(t: string | undefined): t is "caller" | "manager" | "admin" {
  return t === "caller" || t === "manager" || t === "admin";
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") return forbidden();

    const admin = createServiceClient();
    const { data: roles, error } = await admin.from("roles").select("*").order("name");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ roles: roles ?? [], permissionKeys: ALL_PERMISSION_KEYS });
  } catch (e) {
    console.error("[api/admin/roles GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") return forbidden();

    const body = (await request.json()) as {
      id?: string;
      name?: string;
      label: string;
      color?: string;
      description?: string | null;
      access_tier?: string;
      /** When creating a role, copy allowed flags from this existing role name. */
      clone_from_role?: string;
    };
    if (!body.label?.trim()) {
      return NextResponse.json({ error: "Χρειάζεται label" }, { status: 400 });
    }

    const admin = createServiceClient();

    if (body.id) {
      const { data: existing, error: fe } = await admin.from("roles").select("id,name,is_system").eq("id", body.id).maybeSingle();
      if (fe || !existing) {
        return NextResponse.json({ error: "Άγνωστος ρόλος" }, { status: 404 });
      }
      const patch: Record<string, unknown> = {
        label: body.label.trim(),
        color: body.color?.trim() || "#003476",
        description: body.description ?? null,
      };
      if (!existing.is_system && isAccessTier(body.access_tier)) {
        patch.access_tier = body.access_tier;
      }
      const { error } = await admin.from("roles").update(patch).eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const name = body.name?.trim().toLowerCase();
    if (!name || !NAME_RE.test(name)) {
      return NextResponse.json(
        { error: "Όνομα ρόλου: μόνο latin, 2–49 χαρακτήρες, π.χ. field_coordinator" },
        { status: 400 },
      );
    }
    if (["admin", "manager", "caller"].includes(name)) {
      return NextResponse.json({ error: "Αυτό το όνομα είναι δεσμευμένο" }, { status: 400 });
    }

    const tier = isAccessTier(body.access_tier) ? body.access_tier : "caller";
    const { error: ie } = await admin.from("roles").insert({
      name,
      label: body.label.trim(),
      color: body.color?.trim() || "#003476",
      description: body.description ?? null,
      is_system: false,
      access_tier: tier,
    });
    if (ie) {
      return NextResponse.json({ error: ie.message }, { status: 400 });
    }

    const rows = ALL_PERMISSION_KEYS.map((permission_key) => ({
      role_name: name,
      permission_key,
      allowed: false,
    }));
    const { error: pe } = await admin.from("role_permissions").insert(rows);
    if (pe) {
      await admin.from("roles").delete().eq("name", name);
      return NextResponse.json({ error: pe.message }, { status: 400 });
    }

    const cloneFrom = typeof body.clone_from_role === "string" ? body.clone_from_role.trim() : "";
    if (cloneFrom && cloneFrom !== name) {
      const { data: srcRows } = await admin.from("role_permissions").select("permission_key, allowed").eq("role_name", cloneFrom);
      if (srcRows?.length) {
        const ups = srcRows.map((r) => ({
          role_name: name,
          permission_key: r.permission_key as string,
          allowed: Boolean(r.allowed),
        }));
        await admin.from("role_permissions").upsert(ups, { onConflict: "role_name,permission_key" });
      }
    }

    return NextResponse.json({ ok: true, name });
  } catch (e) {
    console.error("[api/admin/roles PUT]", e);
    return nextJsonError();
  }
}
