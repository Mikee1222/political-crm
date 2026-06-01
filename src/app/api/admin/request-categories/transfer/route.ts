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

    const body = (await request.json()) as {
      from_name?: string;
      to_name?: string;
      from?: string;
      to?: string;
    };
    const from_name = String(body.from_name ?? body.from ?? "").trim();
    const to_name = String(body.to_name ?? body.to ?? "").trim();

    if (!from_name || !to_name) {
      return NextResponse.json({ error: "Απαιτούνται from_name και to_name" }, { status: 400 });
    }
    if (from_name === to_name) {
      return NextResponse.json({ error: "Οι κατηγορίες πρέπει να διαφέρουν" }, { status: 400 });
    }

    const service = createServiceClient();
    const transferred = await transferRequestCategory(service, from_name, to_name);
    return NextResponse.json({ transferred });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα";
    if (msg.includes("Άκυρ") || msg.includes("διαφέρουν") || msg.includes("βρέθηκαν") || msg.includes("Απαιτούνται")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[api/admin/request-categories/transfer PATCH]", e);
    return nextJsonError();
  }
}
