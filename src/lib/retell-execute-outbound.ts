import { buildCreatePhoneCallBody, pickRetellDialPhone } from "@/lib/retell-outbound";

export type RetellContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone2?: string | null;
  landline?: string | null;
};

/**
 * POST create-phone-call to Retell; does not update Supabase.
 */
export async function executeRetellCreatePhoneCall(
  contact: RetellContactRow,
  campaignId: string | null,
  overrideAgentId?: string | null,
): Promise<
  | { ok: true; call_id: string | null; retell: Record<string, unknown> }
  | { ok: false; status: number; error: string; detail?: unknown }
> {
  const phone = pickRetellDialPhone(contact);
  if (!phone) {
    return { ok: false, status: 400, error: "Η επαφή δεν έχει έγκυρο αριθμό τηλεφώνου" };
  }
  if (!process.env.RETELL_API_KEY) {
    return { ok: false, status: 503, error: "Η Retell δεν έχει ρυθμιστεί (λείπει RETELL_API_KEY)" };
  }
  if (contact.first_name == null || String(contact.first_name).trim() === "") {
    console.warn(
      "[retell-outbound] first_name missing at dial time",
      { contact_id: contact.id },
    );
  }
  if (contact.last_name == null || String(contact.last_name).trim() === "") {
    console.warn(
      "[retell-outbound] last_name missing at dial time",
      { contact_id: contact.id },
    );
  }
  const first = String(contact.first_name || "").trim() || "Φίλε";
  const last = String(contact.last_name || "").trim();
  let body: Record<string, unknown>;
  try {
    body = buildCreatePhoneCallBody(phone, first, last, contact.id, campaignId, overrideAgentId);
  } catch (e) {
    return {
      ok: false,
      status: 503,
      error: e instanceof Error ? e.message : "Ρύθμιση Retell",
    };
  }
  // Safe to log: body has no API keys (auth is Bearer header only).
  console.log("[retell-outbound] full request body:", JSON.stringify(body, null, 2));

  const retellRes = await fetch("https://api.retellai.com/v2/create-phone-call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await retellRes.json().catch(() => ({}))) as { call_id?: string; [k: string]: unknown };
  const callId = typeof payload.call_id === "string" ? payload.call_id : null;
  if (!retellRes.ok) {
    console.error("[retell-execute-outbound] Retell API error:", {
      status: retellRes.status,
      call_id: callId,
      detail: payload,
    });
    return {
      ok: false,
      status: 400,
      error: "Η Retell απέρριψε την κλήση",
      detail: payload,
    };
  }
  console.log("[retell-execute-outbound] Retell API success:", {
    status: retellRes.status,
    call_id: callId,
  });
  return {
    ok: true,
    call_id: callId,
    retell: payload,
  };
}
