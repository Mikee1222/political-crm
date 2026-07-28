import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getNoAnswerContactIds, getNextUncalledContactIds } from "@/lib/campaign-dial-queue";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

/**
 * Επανεκκίνηση: επιστρέφει πόσοι «Δεν απάντησε» μπορούν να ξανακληθούν.
 * Η πραγματική κλήση γίνεται με POST dial-next?redial_no_answer=1
 */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }
    const { contactIds, error } = await getNoAnswerContactIds(crm.supabase, params.id);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ count: contactIds.length, contact_ids: contactIds });
  } catch (e) {
    console.error("[api/campaigns/id/redial-no-answer GET]", e);
    return nextJsonError();
  }
}

/**
 * Ξεκινά επανεκκίνηση: καλεί dial-next λογική για no-answer subset (ένα batch).
 * Client μπορεί επίσης να καλέσει απευθείας dial-next?redial_no_answer=1 σε loop.
 */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }
    const { contactIds, error } = await getNoAnswerContactIds(crm.supabase, params.id);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (contactIds.length === 0) {
      return NextResponse.json(
        { error: "Δεν υπάρχουν επαφές «Δεν απάντησε» για επανεκκίνηση" },
        { status: 400 },
      );
    }
    const { contactIds: nextBatch, error: qErr } = await getNextUncalledContactIds(
      crm.supabase,
      params.id,
      1,
      { redialNoAnswer: true },
    );
    if (qErr) return NextResponse.json({ error: qErr }, { status: 400 });
    return NextResponse.json({
      ok: true,
      eligible: contactIds.length,
      next_ready: nextBatch.length,
      message: `Έτοιμοι για επανεκκίνηση: ${contactIds.length}. Χρησιμοποιήστε dial-next?redial_no_answer=1.`,
    });
  } catch (e) {
    console.error("[api/campaigns/id/redial-no-answer POST]", e);
    return nextJsonError();
  }
}
