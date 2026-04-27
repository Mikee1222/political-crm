import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { stablePairId } from "@/lib/duplicate-detection";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = (await request.json()) as { contactId1: string; contactId2: string };
  const { small, big } = stablePairId(body.contactId1, body.contactId2);
  const { error } = await supabase.from("contact_relations").insert({
    contact_id_1: small,
    contact_id_2: big,
    relation_type: "family",
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/data-tools/duplicates/family]", e);
    return nextJsonError();
  }
}
