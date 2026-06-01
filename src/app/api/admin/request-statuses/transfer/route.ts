import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireManagerApi } from "@/lib/require-manager-api";
import { createServiceClient } from "@/lib/supabase/admin";
import { transferRequestStatus } from "@/lib/request-admin";
import { isCanonicalRequestStatus } from "@/lib/request-statuses";

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
    if (!isCanonicalRequestStatus(from) || !isCanonicalRequestStatus(to)) {
      return NextResponse.json({ error: "Άκυρη κατάσταση" }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ error: "Οι καταστάσεις πρέπει να διαφέρουν" }, { status: 400 });
    }

    const service = createServiceClient();
    const transferred = await transferRequestStatus(service, from, to);
    return NextResponse.json({ transferred });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα";
    if (msg.includes("Άκυρ") || msg.includes("διαφέρουν")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[api/admin/request-statuses/transfer PATCH]", e);
    return nextJsonError();
  }
}
