import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import type { RequestCategoryRow } from "@/lib/request-categories";
export const dynamic = "force-dynamic";

/** List categories for request forms (managers+). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("request_categories")
      .select("id, name, color, sort_order, created_at, sla_days")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ categories: (data ?? []) as RequestCategoryRow[] });
  } catch (e) {
    console.error("[api/request-categories GET]", e);
    return nextJsonError();
  }
}
