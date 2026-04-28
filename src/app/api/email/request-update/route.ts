import { NextRequest, NextResponse } from "next/server";
import { requireManagerEmail } from "@/lib/email-api-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { EmailTemplates, getPortalBaseUrl, sendResendEmail } from "@/lib/email";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const s = await requireManagerEmail();
    if ("error" in s) return s.error;
    const body = (await request.json()) as { request_id?: string };
    const id = String(body.request_id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Απαιτείται request_id" }, { status: 400 });
    }
    const admin = createServiceClient();
    const { data: req, error } = await admin
      .from("requests")
      .select("id, request_code, status, contact_id, title")
      .eq("id", id)
      .single();
    if (error || !req) {
      return NextResponse.json({ error: "Δεν βρέθηκε αίτημα" }, { status: 400 });
    }
    const { data: c } = await admin
      .from("contacts")
      .select("id, email, first_name, last_name")
      .eq("id", (req as { contact_id: string }).contact_id)
      .single();
    if (!c) {
      return NextResponse.json({ error: "Δεν βρέθηκε επαφή" }, { status: 400 });
    }
    const email = String((c as { email: string | null }).email ?? "").trim();
    if (!email) {
      return NextResponse.json({ error: "Η επαφή δεν έχει email" }, { status: 400 });
    }
    const full = `${(c as { first_name: string }).first_name} ${(c as { last_name: string }).last_name}`.trim();
    const greet = firstNameFromFull(full);
    const t = EmailTemplates.requestStatusUpdate(
      greet,
      String((req as { request_code: string }).request_code ?? ""),
      "—",
      String((req as { status: string | null }).status ?? "—"),
      getPortalBaseUrl(),
    );
    const r = await sendResendEmail({
      to: email,
      subject: t.subj,
      html: t.html,
      template: "REQUEST_STATUS_UPDATE",
      contact_id: (c as { id: string }).id,
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
