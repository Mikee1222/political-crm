import { NextRequest, NextResponse } from "next/server";
import { requireManagerEmail } from "@/lib/email-api-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { EmailTemplates, sendResendEmail } from "@/lib/email";
import { nextJsonError } from "@/lib/api-resilience";
import { firstNameFromFull } from "@/lib/activity-descriptions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const s = await requireManagerEmail();
    if ("error" in s) return s.error;
    const body = (await request.json()) as { contact_id?: string };
    const contactId = String(body.contact_id ?? "").trim();
    if (!contactId) {
      return NextResponse.json({ error: "Απαιτείται contact_id" }, { status: 400 });
    }
    const admin = createServiceClient();
    const { data: c, error } = await admin.from("contacts").select("id, email, first_name, last_name").eq("id", contactId).single();
    if (error || !c) {
      return NextResponse.json({ error: "Δεν βρέθηκε η επαφή" }, { status: 400 });
    }
    const email = String((c as { email: string | null }).email ?? "").trim();
    if (!email) {
      return NextResponse.json({ error: "Η επαφή δεν έχει email" }, { status: 400 });
    }
    const full = `${(c as { first_name: string }).first_name} ${(c as { last_name: string }).last_name}`.trim();
    const name = firstNameFromFull(full);
    const t = EmailTemplates.namedayWishes(name);
    const r = await sendResendEmail({
      to: email,
      subject: t.subj,
      html: t.html,
      template: "NAMEDAY_WISHES",
      contact_id: contactId,
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
