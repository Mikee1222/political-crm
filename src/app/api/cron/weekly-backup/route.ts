import { NextRequest, NextResponse } from "next/server";
import { buildFullBackupZipBuffer } from "@/lib/export-buffers";
import { sendResendEmail, getPublicBaseUrl } from "@/lib/email";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

function assertCronOrSecret(req: NextRequest): boolean {
  const v = req.headers.get("x-vercel-cron");
  if (v === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    return false;
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

export async function GET(request: NextRequest) {
  try {
    if (!assertCronOrSecret(request)) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const to = process.env.ADMIN_EMAIL?.trim();
    if (!to) {
      return NextResponse.json({ error: "Λείπει ADMIN_EMAIL" }, { status: 500 });
    }
    const buf = await buildFullBackupZipBuffer();
    const d = new Date();
    const fn = `kk-weekly-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.zip`;
    const r = await sendResendEmail({
      to,
      subject: "Εβδομαδιαίο backup — Καραγκούνης CRM",
      html: `<p>Συνημμένο: πλήρες backup (επαφές, αιτήματα, κλήσεις, εργασίες).</p><p><a href="${getPublicBaseUrl()}">CRM</a></p>`,
      template: "WEEKLY_BACKUP",
      attachments: [{ filename: fn, content: buf }],
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
