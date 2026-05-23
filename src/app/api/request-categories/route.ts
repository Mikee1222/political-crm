import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { REQUEST_CATEGORY_NAMES } from "@/lib/request-category-list";
export const dynamic = "force-dynamic";

/** List categories for request forms (managers+). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    return NextResponse.json({ categories: REQUEST_CATEGORY_NAMES });
  } catch (e) {
    console.error("[api/request-categories GET]", e);
    return nextJsonError();
  }
}
