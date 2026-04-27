import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { sendResendEmail, getPublicBaseUrl } from "@/lib/email";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { user, profile } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const to =
      process.env.ADMIN_EMAIL?.trim() ||
      user.email ||
      "";
    if (!to) {
      return NextResponse.json({ error: "Λείπει email προορισμού" }, { status: 400 });
    }
    const r = await sendResendEmail({
      to,
      subject: "Δοκιμαστικό email — Καραγκούνης CRM",
      html: `<p>Αυτό είναι <strong>δοκιμαστικό</strong> email από το CRM.</p><p>Base URL: <code>${getPublicBaseUrl()}</code></p>`,
      template: "TEST",
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, to });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
