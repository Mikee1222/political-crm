import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";

const KK = "#003476";
const GOLD = "#C9A84C";

function wrapHtml(title: string, inner: string, footerLine?: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px">
    <tr><td align="center">
      <table width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,52,118,0.12)">
        <tr><td style="background:linear-gradient(135deg,${KK} 0%,#001a3d 100%);padding:20px 24px;text-align:center">
          <span style="display:inline-block;width:40px;height:40px;line-height:40px;border-radius:50%;background:linear-gradient(145deg,${GOLD},#8b6914);color:#0a0f1a;font-weight:800">ΚΚ</span>
          <div style="color:#fff;font-size:18px;font-weight:700;margin-top:8px">Κώστας Καραγκούνης</div>
          <div style="color:rgba(255,255,255,0.85);font-size:12px">Βουλευτής · Νέα Δημοκρατία</div>
        </td></tr>
        <tr><td style="padding:24px 24px 32px;color:#1e293b;font-size:15px;line-height:1.6">
          ${inner}
        </td></tr>
        <tr><td style="padding:12px 24px 20px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center">
          ${footerLine ?? "Καραγκούνης CRM"}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export const EmailTemplates = {
  namedayWishes(firstName: string) {
    const subj = `Χρόνια Πολλά, ${firstName}!`;
    const body = wrapHtml(
      subj,
      `<p>Αγαπητέ/Αγαπητή <strong>${firstName}</strong>,</p>
       <p>Με αφορμή την ονομαστική σας εορτή, ο βουλευτής <strong>Κώστας Καραγκούνης</strong> σας εύχεται <strong>Χρόνια Πολλά</strong> — υγεία, δύναμη και κάθε ευτυχία.</p>
       <p style="color:#64748b;font-size:14px">Με εκτίμηση,<br/>Το γραφείο βουλευτή</p>`,
    );
    return { subj, html: body };
  },
  requestStatusUpdate(
    firstName: string,
    requestCode: string,
    oldStatus: string,
    newStatus: string,
    portalBase: string,
  ) {
    const subj = `Ενημέρωση αιτήματος #${requestCode}`;
    const link = `${portalBase.replace(/\/$/, "")}/portal/requests`;
    const body = wrapHtml(
      subj,
      `<p>Γεια σας <strong>${firstName}</strong>,</p>
       <p>Η κατάσταση του αιτήματος <strong>#${requestCode}</strong> ενημερώθηκε.</p>
       <p><span style="color:#64748b">Προηγούμενη:</span> <strong>${oldStatus}</strong> → <span style="color:#64748b">Νέα:</span> <strong style="color:${KK}">${newStatus}</strong></p>
       <p><a href="${link}" style="display:inline-block;margin-top:8px;padding:10px 18px;background:${KK};color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Προβολή στο portal</a></p>`,
    );
    return { subj, html: body };
  },
  newsletter(subject: string, htmlContent: string, unsubscribeUrl?: string) {
    const foot = unsubscribeUrl
      ? `<a href="${unsubscribeUrl}" style="color:#64748b">Διαγραφή από τη λίστα</a>`
      : "Καραγκούνης CRM";
    return {
      subj: subject,
      html: wrapHtml(subject, htmlContent, foot),
    };
  },
  verifyEmail(verifyUrl: string) {
    const subj = "Επαλήθευση email — Portal Καραγκούνη";
    const body = wrapHtml(
      subj,
      `<p>Καλησπέρα σας,</p>
       <p>Για να ενεργοποιήσετε το λογαριασμό σας στο portal, πατήστε:</p>
       <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 18px;background:${KK};color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Επαλήθευση email</a></p>
       <p style="font-size:12px;color:#64748b">Το link λήγει όταν δημιουργήσετε νέα αίτηση σύνδεσης.</p>`,
    );
    return { subj, html: body };
  },
  appointmentConfirmation(
    whenLabel: string,
    reason: string,
  ) {
    const subj = "Επιβεβαίωση ραντεβού — γραφείο βουλευτή";
    const body = wrapHtml(
      subj,
      `<p>Καλησπέρα σας,</p>
       <p>Το αίτημά σας για <strong>ραντεβού</strong> καταχωρήθηκε.</p>
       <p><strong>Ημερομηνία / ώρα:</strong> ${whenLabel}</p>
       <p><strong>Θέμα:</strong> ${reason.replace(/</g, "&lt;")}</p>
       <p style="color:#64748b;font-size:14px">Για αλλαγές επικοινωνήστε με το γραφείο.</p>`,
    );
    return { subj, html: body };
  },
};

export async function logEmailRow(params: {
  to_email: string;
  subject: string;
  template: string;
  status: string;
  contact_id?: string | null;
}) {
  try {
    const admin = createServiceClient();
    await admin.from("email_logs").insert({
      to_email: params.to_email,
      subject: params.subject,
      template: params.template,
      status: params.status,
      contact_id: params.contact_id ?? null,
    } as never);
  } catch (e) {
    console.error("[email_logs]", e);
  }
}

export async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  template: string;
  contact_id?: string | null;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    await logEmailRow({
      to_email: params.to,
      subject: params.subject,
      template: params.template,
      status: "skipped_no_config",
      contact_id: params.contact_id,
    });
    return { ok: false, error: "Λείπει RESEND_API_KEY ή RESEND_FROM_EMAIL" };
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (error) {
      await logEmailRow({
        to_email: params.to,
        subject: params.subject,
        template: params.template,
        status: "error",
        contact_id: params.contact_id,
      });
      return { ok: false, error: error.message };
    }
    await logEmailRow({
      to_email: params.to,
      subject: params.subject,
      template: params.template,
      status: "sent",
      contact_id: params.contact_id,
    });
    return { ok: true };
  } catch (e) {
    await logEmailRow({
      to_email: params.to,
      subject: params.subject,
      template: params.template,
      status: "error",
      contact_id: params.contact_id,
    });
    return { ok: false, error: e instanceof Error ? e.message : "send error" };
  }
}

/** CRM app (managers): e.g. https://crm.kkaragkounis.com */
export function getCrmBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  return "http://localhost:3000";
}

/**
 * Public portal (πολίτες): e.g. https://kkaragkounis.com — `/portal/*`, επαλήθευση email, προσκλήσεις.
 * Falls back to CRM base if unset (single-host deploys).
 */
export function getPortalBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  return getCrmBaseUrl();
}

/** @deprecated Use `getCrmBaseUrl()` — kept for callers that mean «δημόσιο URL του CRM». */
export function getPublicBaseUrl(): string {
  return getCrmBaseUrl();
}
