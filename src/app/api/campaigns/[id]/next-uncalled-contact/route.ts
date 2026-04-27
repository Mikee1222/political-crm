import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getNextUncalledContactId } from "@/lib/campaign-dial-queue";

export const dynamic = "force-dynamic";

/** Επόμενο contact_id στην καμπάνια χωρίς εγγραφή κλήσης (για UI → POST /api/retell/call). */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  if (!hasMinRole(crm.profile?.role, "manager")) {
    return forbidden();
  }
  const { supabase } = crm;
  const { contactId, error } = await getNextUncalledContactId(supabase, params.id);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!contactId) {
    return NextResponse.json({ contact_id: null, done: true } as const);
  }
  return NextResponse.json({ contact_id: contactId, done: false } as const);
}
