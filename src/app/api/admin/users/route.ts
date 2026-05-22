import { requireCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  joined_at: string;
  last_sign_in_at: string | null;
};

/** All CRM staff profiles (non-portal). Managers+ for assignee dropdowns; settings admin UI uses same list. */
export async function GET() {
  const crm = await requireCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile } = crm;
  if (!hasMinRole(profile?.role, "manager")) return forbidden();

  try {
    const admin = createServiceClient();
    const { data: prows, error: profErr } = await admin
      .from("profiles")
      .select("id, full_name, role, is_portal, created_at")
      .eq("is_portal", false)
      .order("full_name", { ascending: true, nullsFirst: false });
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    const authById = new Map<
      string,
      { email: string; created_at: string; last_sign_in_at: string | null }
    >();
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (!listErr) {
      for (const u of listData?.users ?? []) {
        if (!u.id) continue;
        authById.set(u.id, {
          email: u.email ?? "",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
    }

    const users: Row[] = (prows ?? []).map((p) => {
      const auth = authById.get(p.id);
      return {
        id: p.id,
        full_name: p.full_name,
        email: auth?.email ?? "",
        role: p.role ?? "caller",
        joined_at: auth?.created_at ?? p.created_at ?? "",
        last_sign_in_at: auth?.last_sign_in_at ?? null,
      };
    });

    return NextResponse.json({ users });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message || "Λάθος service role" }, { status: 500 });
  }
}
