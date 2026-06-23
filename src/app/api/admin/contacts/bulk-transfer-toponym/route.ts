import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (crm.profile?.role !== "admin") {
      return forbidden();
    }

    const body = (await request.json()) as { from?: string; to?: string; from_id?: string; to_id?: string };
    const from = String(body.from ?? body.from_id ?? "").trim();
    const to = String(body.to ?? body.to_id ?? "").trim();
    if (!from || !to) {
      return NextResponse.json({ error: "Απαιτούνται from και to" }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ error: "Τα τοπωνύμια πρέπει να διαφέρουν" }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: updated, error } = await service
      .from("contacts")
      .update({ toponym: to })
      .eq("toponym", from)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ transferred: updated?.length ?? 0 });
  } catch (e) {
    console.error("[api/admin/contacts/bulk-transfer-toponym POST]", e);
    return nextJsonError();
  }
}
