import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase, user } = crm;
    const requestId = params.id;

    const { error } = await supabase.from("request_views").upsert(
      {
        user_id: user.id,
        request_id: requestId,
        viewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,request_id" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/requests/[id]/view]", e);
    return nextJsonError();
  }
}
