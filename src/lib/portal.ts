import { randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextPaddedCode } from "@/lib/codes";
import { inferRequestCategoryFromDescription } from "@/lib/request-auto-category";
import { addDaysYmd, computeSlaStatus } from "@/lib/request-sla";
import { EmailTemplates, getPortalBaseUrl, sendResendEmail } from "@/lib/email";

export { slugifyNews } from "@/lib/slugify";

export type PortalUserRow = {
  id: string;
  auth_user_id: string;
  contact_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
  verified: boolean;
  created_at: string;
  push_subscription?: unknown;
  verification_token?: string | null;
};

export async function getPortalUser(supabase: SupabaseClient, authUserId: string): Promise<PortalUserRow | null> {
  const { data } = await supabase
    .from("portal_users")
    .select("id, auth_user_id, contact_id, first_name, last_name, phone, email, verified, created_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return (data as PortalUserRow) ?? null;
}

/** Register citizen: create auth user, profile is_portal, contact link, portal_users. */
export async function registerPortalCitizen(input: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  /** Προσκλητήριο: token από σύνδεσμο /portal/register?invite= */
  invite_token?: string;
}): Promise<{ userId: string; error?: string }> {
  const admin = createServiceClient();
  const email = input.email.trim().toLowerCase();
  const { data: auth, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: false,
    /** Stops public.handle_new_user() from inserting a default CRM profile; register path upserts is_portal. */
    app_metadata: { portal_signup: true },
  });
  if (authErr || !auth.user) {
    return { userId: "", error: authErr?.message ?? "auth error" };
  }
  const userId = auth.user.id;

  let contactId: string | null = null;
  const inviteT = (input.invite_token ?? "").trim();
  if (inviteT) {
    const { data: invC } = await admin.from("contacts").select("id, email, portal_invite_token").eq("portal_invite_token", inviteT).limit(1).maybeSingle();
    if (invC?.id) {
      contactId = (invC as { id: string }).id;
    }
  }
  if (!contactId) {
    const phoneT = input.phone.trim();
    const orParts: string[] = [];
    if (email) orParts.push(`email.eq.${email}`);
    if (phoneT) orParts.push(`phone.eq.${phoneT}`);
    if (orParts.length) {
      const { data: byOr } = await admin.from("contacts").select("id").or(orParts.join(",")).limit(1).maybeSingle();
      if (byOr?.id) {
        contactId = (byOr as { id: string }).id;
      }
    }
  }
  if (!contactId) {
    const code = await nextPaddedCode(admin, "contacts", "contact_code", "EP");
    const { data: ins, error: insE } = await admin
      .from("contacts")
      .insert({
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        email: email,
        phone: input.phone.trim() || null,
        contact_code: code,
        source: "Portal",
        call_status: "Pending",
      } as never)
      .select("id")
      .single();
    if (insE || !ins) {
      await admin.auth.admin.deleteUser(userId);
      return { userId: "", error: insE?.message ?? "επαφή" };
    }
    contactId = (ins as { id: string }).id;
  }

  const verifyToken = randomBytes(32).toString("hex");
  const { error: pIns } = await admin
    .from("portal_users")
    .insert({
      auth_user_id: userId,
      contact_id: contactId,
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      phone: input.phone.trim() || null,
      email,
      verified: false,
      verification_token: verifyToken,
    } as never);
  if (pIns) {
    await admin.auth.admin.deleteUser(userId);
    return { userId: "", error: pIns.message };
  }
  if (inviteT) {
    await admin.from("contacts").update({ portal_invite_token: null } as never).eq("id", contactId);
  }

  const fullName = `${input.first_name.trim()} ${input.last_name.trim()}`;
  await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      role: "caller",
      is_portal: true,
    } as never,
    { onConflict: "id" },
  );

  const u = EmailTemplates.verifyEmail(`${getPortalBaseUrl()}/portal/verify?token=${encodeURIComponent(verifyToken)}`);
  void sendResendEmail({
    to: email,
    subject: u.subj,
    html: u.html,
    template: "VERIFY_PORTAL",
    contact_id: contactId,
  });

  return { userId };
}

export async function createPortalRequest(
  supabase: SupabaseClient,
  portal: PortalUserRow,
  body: { title?: string; description?: string; category?: string },
) {
  if (!portal.contact_id) {
    return { error: "Λείπει σύνδεση επαφής. Επικοινωνήστε με το γραφείο." };
  }
  const title = String(body.title ?? "").trim();
  if (!title) {
    return { error: "Απαιτείται τίτλος" };
  }
  const descRaw = String(body.description ?? "");
  let categoryName = String(body.category ?? "").trim();
  if (!categoryName) {
    const inferred = await inferRequestCategoryFromDescription(descRaw);
    categoryName = inferred || "Άλλο";
  }
  const { data: catRow } = await supabase.from("request_categories").select("sla_days").eq("name", categoryName).maybeSingle();
  const slaDays =
    typeof (catRow as { sla_days?: number } | null)?.sla_days === "number" ? (catRow as { sla_days: number }).sla_days : 14;
  const now = new Date();
  const sla = addDaysYmd(now.toISOString(), slaDays);
  const slaStatus = computeSlaStatus(sla, "Νέο");
  const code = await nextPaddedCode(supabase, "requests", "request_code", "AIT");
  const { data, error } = await supabase
    .from("requests")
    .insert({
      contact_id: portal.contact_id,
      title,
      description: descRaw || null,
      category: categoryName,
      status: "Νέο",
      request_code: code,
      priority: "Medium",
      portal_visible: true,
      sla_due_date: sla,
      sla_status: slaStatus,
      updated_at: new Date().toISOString(),
    } as never)
    .select("id, request_code, title, status, created_at, category, description, portal_message")
    .single();
  if (error) {
    return { error: error.message };
  }
  return { data };
}
