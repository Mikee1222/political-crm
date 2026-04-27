import { NextRequest, NextResponse } from "next/server";
import { requireManagerEmail } from "@/lib/email-api-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { EmailTemplates, getPublicBaseUrl, sendResendEmail } from "@/lib/email";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const s = await requireManagerEmail();
    if ("error" in s) return s.error;
    const body = (await request.json()) as { subject?: string; html?: string; group_id?: string | null };
    const subject = String(body.subject ?? "").trim();
    const html = String(body.html ?? "").trim();
    if (!subject || !html) {
      return NextResponse.json({ error: "Θέμα και περιεχόμενο απαιτούνται" }, { status: 400 });
    }
    const groupId = body.group_id != null && body.group_id !== "" ? String(body.group_id) : null;
    const admin = createServiceClient();
    let q = admin
      .from("contacts")
      .select("id, email, first_name, last_name")
      .not("email", "is", null)
      .neq("email", "");
    if (groupId) {
      q = q.eq("group_id", groupId);
    }
    const { data: rows, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const list = (rows ?? []) as { id: string; email: string }[];
    const unsub = `${getPublicBaseUrl()}/profile`;
    const tpl = EmailTemplates.newsletter(subject, html, unsub);
    let sent = 0;
    for (const r of list) {
      const em = String(r.email ?? "").trim();
      if (!em) continue;
      const res = await sendResendEmail({
        to: em,
        subject: tpl.subj,
        html: tpl.html,
        template: "NEWSLETTER",
        contact_id: r.id,
      });
      if (res.ok) sent += 1;
    }
    return NextResponse.json({ ok: true, sent, total: list.length });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
