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

    const { data: camp } = await crm.supabase
      .from("campaigns")
      .select("last_no_answer_redial_at")
      .eq("id", params.id)
      .maybeSingle();
    const last =
      (camp as { last_no_answer_redial_at?: string | null } | null)?.last_no_answer_redial_at ?? null;

    return NextResponse.json({
      count: contactIds.length,
      contact_ids: contactIds,
      last_no_answer_redial_at: last,
    });
  } catch (e) {
    console.error("[api/campaigns/id/redial-no-answer GET]", e);
    return nextJsonError();
  }
}

/**
 * Ξεκινά επανεκκίνηση: αποθηκεύει timestamp και επιβεβαιώνει eligibility.
 * Client καλεί dial-next?redial_no_answer=1 για τις κλήσεις.
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

    const stampedAt = new Date().toISOString();
    const { error: updErr } = await crm.supabase
      .from("campaigns")
      .update({ last_no_answer_redial_at: stampedAt })
      .eq("id", params.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

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
      last_no_answer_redial_at: stampedAt,
      message: `Έτοιμοι για επανεκκίνηση: ${contactIds.length}. Χρησιμοποιήστε dial-next?redial_no_answer=1.`,
    });
  } catch (e) {
    console.error("[api/campaigns/id/redial-no-answer POST]", e);
    return nextJsonError();
  }
}
