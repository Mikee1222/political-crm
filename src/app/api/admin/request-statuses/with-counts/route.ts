import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireManagerApi } from "@/lib/require-manager-api";
import { createServiceClient } from "@/lib/supabase/admin";
import { listRequestStatusesWithCounts } from "@/lib/request-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    const denied = requireManagerApi(crm);
    if (denied) return denied;

    const service = createServiceClient();
    const statuses = await listRequestStatusesWithCounts(service);
    return NextResponse.json(statuses);
  } catch (e) {
    console.error("[api/admin/request-statuses/with-counts GET]", e);
    return nextJsonError();
  }
}
