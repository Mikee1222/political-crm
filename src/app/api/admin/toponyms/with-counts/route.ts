import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireManagerApi } from "@/lib/require-manager-api";
import { createServiceClient } from "@/lib/supabase/admin";
import { listToponymsWithContactCounts } from "@/lib/contact-location-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    const denied = requireManagerApi(crm);
    if (denied) return denied;

    const service = createServiceClient();
    const toponyms = await listToponymsWithContactCounts(service);
    return NextResponse.json({ toponyms });
  } catch (e) {
    console.error("[api/admin/toponyms/with-counts GET]", e);
    return nextJsonError();
  }
}
