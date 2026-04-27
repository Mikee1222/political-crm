import { buildCreatePhoneCallBody } from "@/lib/retell-outbound";

export type RetellContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

const phoneDigits = (s: string) => s.replace(/\D/g, "");

/**
 * POST create-phone-call to Retell; does not update Supabase.
 */
export async function executeRetellCreatePhoneCall(
  contact: RetellContactRow,
  campaignId: string | null,
): Promise<
  | { ok: true; call_id: string | null; retell: Record<string, unknown> }
  | { ok: false; status: number; error: string; detail?: unknown }
> {
  const phone = (contact.phone ?? "").toString().trim();
  if (!phone || phoneDigits(phone).length < 8) {
    return { ok: false, status: 400, error: "Η επαφή δεν έχει έγκυρο αριθμό τηλεφώνου" };
  }
  if (!process.env.RETELL_API_KEY) {
    return { ok: false, status: 503, error: "Η Retell δεν έχει ρυθμιστεί (λείπει RETELL_API_KEY)" };
  }
  const first = String(contact.first_name || "").trim() || "Φίλε";
  const last = String(contact.last_name || "").trim();
  let callBody: Record<string, unknown>;
  try {
    callBody = buildCreatePhoneCallBody(phone, first, last, contact.id, campaignId);
  } catch (e) {
    return {
      ok: false,
      status: 503,
      error: e instanceof Error ? e.message : "Ρύθμιση Retell",
    };
  }
  const retellRes = await fetch("https://api.retellai.com/v2/create-phone-call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(callBody),
  });
  const payload = (await retellRes.json().catch(() => ({}))) as { call_id?: string; [k: string]: unknown };
  if (!retellRes.ok) {
    return {
      ok: false,
      status: 400,
      error: "Η Retell απέρριψε την κλήση",
      detail: payload,
    };
  }
  return {
    ok: true,
    call_id: typeof payload.call_id === "string" ? payload.call_id : null,
    retell: payload,
  };
}
