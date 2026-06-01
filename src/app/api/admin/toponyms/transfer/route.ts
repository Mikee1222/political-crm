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

    const body = (await request.json()) as { from_id?: string; to_id?: string };
    const from_id = String(body.from_id ?? "").trim();
    const to_id = String(body.to_id ?? "").trim();
    if (!from_id || !to_id) {
      return NextResponse.json({ error: "Απαιτούνται from_id και to_id" }, { status: 400 });
    }
    if (from_id === to_id) {
      return NextResponse.json({ error: "Τα τοπωνύμια πρέπει να διαφέρουν" }, { status: 400 });
    }

    const service = createServiceClient();
    const [{ data: fromRow, error: fromErr }, { data: toRow, error: toErr }] = await Promise.all([
      service.from("toponyms").select("name").eq("id", from_id).maybeSingle(),
      service.from("toponyms").select("name").eq("id", to_id).maybeSingle(),
    ]);

    if (fromErr || toErr) {
      return NextResponse.json({ error: fromErr?.message ?? toErr?.message ?? "Σφάλμα" }, { status: 400 });
    }
    if (!fromRow?.name || !toRow?.name) {
      return NextResponse.json({ error: "Τοπωνύμιο δεν βρέθηκε" }, { status: 404 });
    }

    const fromName = String(fromRow.name).trim();
    const toName = String(toRow.name).trim();

    const { data: updated, error } = await service
      .from("contacts")
      .update({ toponym: toName })
      .eq("toponym", fromName)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ transferred: updated?.length ?? 0 });
  } catch (e) {
    console.error("[api/admin/toponyms/transfer PATCH]", e);
    return nextJsonError();
  }
}
