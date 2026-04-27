import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getPublicBaseUrl } from "@/lib/email";
import { sendResendEmail } from "@/lib/email";
import { sendWhatsAppMessage, isWhatsAppConfigured } from "@/lib/whatsapp";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pollId } = await context.params;
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const { data: poll, error } = await supabase
      .from("polls")
      .select("id, title, target_group_id")
      .eq("id", pollId)
      .maybeSingle();
    if (error || !poll) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 404 });
    }
    const gid = (poll as { target_group_id: string | null }).target_group_id;
    if (!gid) {
      return NextResponse.json({ error: "Χρειάζεται ομάδα-στόχος" }, { status: 400 });
    }
    const { data: members, error: me } = await supabase
      .from("contacts")
      .select("id, first_name, email, phone")
      .eq("group_id", gid);
    if (me) {
      return NextResponse.json({ error: me.message }, { status: 400 });
    }
    const base = getPublicBaseUrl();
    let emailN = 0;
    let waN = 0;
    for (const row of members ?? []) {
      const c = row as { id: string; first_name: string; email: string | null; phone: string | null };
      const link = `${base}/poll/${pollId}?contact=${c.id}`;
      if (c.email?.includes("@")) {
        const subj = `Δημοσκόπηση: ${(poll as { title: string }).title}`;
        const html = `<p>Καλησπέρα${c.first_name ? `, ${c.first_name}` : ""},</p><p>Μπορείτε να συμμετάσχετε:</p><p><a href="${link}">Άνοιγμα δημοσκόπησης</a></p>`;
        const r = await sendResendEmail({
          to: c.email!,
          subject: subj,
          html: `<!DOCTYPE html><html><body>${html}</body></html>`,
          template: "poll",
          contact_id: c.id,
        });
        if (r.ok) {
          emailN += 1;
        }
      }
      if (isWhatsAppConfigured() && c.phone?.trim()) {
        const r2 = await sendWhatsAppMessage(c.phone, `Καλησπέρα! Δημοσκόπηση: ${(poll as { title: string }).title} — ${link}`);
        if (r2.ok) {
          waN += 1;
        }
        const admin = createServiceClient();
        void admin.from("whatsapp_messages").insert({
          contact_id: c.id,
          direction: "outbound",
          message: `poll link: ${link}`,
          status: "sent",
        });
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
    return NextResponse.json({ ok: true, email_sent: emailN, whatsapp_sent: waN, total: (members ?? []).length });
  } catch (e) {
    console.error("[api/polls send]", e);
    return nextJsonError();
  }
}
