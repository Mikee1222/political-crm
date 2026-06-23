import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";
import { listRequestCategoriesWithCounts } from "@/lib/request-admin";
import { requireSettingsEdit } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;

    const service = createServiceClient();
    const categories = await listRequestCategoriesWithCounts(service, crm.supabase);
    return NextResponse.json(
      categories.map(({ name, request_count, color, id }) => ({
        name,
        request_count,
        color,
        id,
      })),
    );
  } catch (e) {
    console.error("[api/admin/request-categories/with-counts GET]", e);
    return nextJsonError();
  }
}
