import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireManagerApi } from "@/lib/require-manager-api";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    const denied = requireManagerApi(crm);
    if (denied) return denied;

    const body = (await request.json()) as { from?: string; to?: string };
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    if (!from || !to) {
      return NextResponse.json({ error: "Απαιτούνται from και to" }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ error: "Οι δήμοι πρέπει να διαφέρουν" }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: updated, error } = await service
      .from("contacts")
      .update({ municipality: to })
      .eq("municipality", from)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ transferred: updated?.length ?? 0 });
  } catch (e) {
    console.error("[api/admin/municipalities/transfer PATCH]", e);
    return nextJsonError();
  }
}
