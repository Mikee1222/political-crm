import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import type { UserProfile } from "@/lib/auth-helpers";
export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  full_name: string | null;
  role: string;
  created_at: string | undefined;
  email: string;
  joined_at: string;
  last_sign_in_at: string | null;
};

export async function GET() {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile } = crm;
  if (profile?.role !== "admin") return forbidden();

  try {
    const admin = createServiceClient();
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 400 });
    }
    const { data: prows } = await admin.from("profiles").select("id, full_name, role, created_at");
    const pmap = new Map(
      (prows ?? []).map(
        (p) =>
          [p.id, p] as [
            string,
            { id: string; full_name: string | null; role: string; created_at: string },
          ],
      ),
    );
    const users: Row[] = (listData?.users ?? []).map((u) => {
      const p = pmap.get(u.id) as
        | { id: string; full_name: string | null; role: string; created_at: string }
        | undefined;
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: p?.full_name ?? (u.user_metadata as { full_name?: string })?.full_name ?? null,
        role: (p?.role as UserProfile["role"]) ?? "caller",
        created_at: p?.created_at,
        joined_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    });
    return NextResponse.json({ users });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message || "Λάθος service role" }, { status: 500 });
  }
}
