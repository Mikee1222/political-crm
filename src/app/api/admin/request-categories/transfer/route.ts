import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";
import { transferRequestCategory } from "@/lib/request-admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }

    const body = (await request.json()) as { from_id?: string; to_id?: string };
    const from_id = String(body.from_id ?? "").trim();
    const to_id = String(body.to_id ?? "").trim();

    if (!from_id || !to_id) {
      return NextResponse.json({ error: "Απαιτούνται from_id και to_id" }, { status: 400 });
    }
    if (from_id === to_id) {
      return NextResponse.json({ error: "Οι κατηγορίες πρέπει να διαφέρουν" }, { status: 400 });
    }

    const service = createServiceClient();
    const transferred = await transferRequestCategory(service, from_id, to_id);
    return NextResponse.json({ transferred });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα";
    if (msg.includes("Άκυρ") || msg.includes("διαφέρουν") || msg.includes("βρέθηκαν")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[api/admin/request-categories/transfer PATCH]", e);
    return nextJsonError();
  }
}
