import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { REQUEST_CATEGORY_NAMES } from "@/lib/request-category-list";
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
      .select("id, name, color, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (!error && data?.length) {
      const items = data as RequestCategoryRow[];
      return NextResponse.json({
        categories: items.map((c) => c.name),
        items,
      });
    }
    return NextResponse.json({ categories: REQUEST_CATEGORY_NAMES, items: [] });
  } catch (e) {
    console.error("[api/request-categories GET]", e);
    return nextJsonError();
  }
}
