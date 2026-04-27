import { createServiceClient } from "@/lib/supabase/admin";
import { EmailTemplates, getPublicBaseUrl, sendResendEmail } from "@/lib/email";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { sendWebPushToSubscription } from "@/lib/push-server";
import type webpush from "web-push";

export async function notifyRequestStatusToCitizen(input: {
  contactId: string;
  requestCode: string;
  oldStatus: string;
  newStatus: string;
}): Promise<void> {
  if (input.oldStatus === input.newStatus) return;
  const admin = createServiceClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, email, first_name, last_name")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact?.email || String((contact as { email?: string }).email).trim() === "") return;

  const { data: portal } = await admin
    .from("portal_users")
    .select("id, push_subscription, email")
    .eq("contact_id", input.contactId)
    .maybeSingle();
  if (!portal) return;

  const full = `${(contact as { first_name?: string }).first_name ?? ""} ${(contact as { last_name?: string }).last_name ?? ""}`.trim();
  const greet = firstNameFromFull(full) || (contact as { first_name?: string }).first_name || "πολίτη";
  const base = getPublicBaseUrl();
  const t = EmailTemplates.requestStatusUpdate(
    greet,
    input.requestCode,
    input.oldStatus,
    input.newStatus,
    base,
  );
  const email = String((contact as { email: string }).email).trim();
  void sendResendEmail({
    to: email,
    subject: t.subj,
    html: t.html,
    template: "REQUEST_STATUS_UPDATE",
    contact_id: input.contactId,
  });

  const raw = (portal as { push_subscription?: unknown }).push_subscription;
  if (raw && typeof raw === "object" && "endpoint" in (raw as { endpoint?: string })) {
    const title = "Ενημέρωση αιτήματος";
    const body = `Το αίτημά σας #${input.requestCode} ενημερώθηκε: ${input.newStatus}`;
    void sendWebPushToSubscription(
      raw as webpush.PushSubscription,
      { title, body, data: { request_code: input.requestCode } },
    );
  }
}
