import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";
import { listRequestCategoriesWithCounts } from "@/lib/request-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }

    const service = createServiceClient();
    const categories = await listRequestCategoriesWithCounts(service);
    return NextResponse.json(categories);
  } catch (e) {
    console.error("[api/admin/request-categories/with-counts GET]", e);
    return nextJsonError();
  }
}
