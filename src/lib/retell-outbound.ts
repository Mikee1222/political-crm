/**
 * Normalize Greek contact numbers to E.164 for Retell `to_number`.
 * Returns null when the value cannot be mapped to a usable E.164 candidate.
 */
export function formatGreekPhoneForRetell(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const rest = trimmed.slice(1).replace(/\D/g, "");
    return rest ? `+${rest}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0030")) {
    const national = digits.slice(4);
    return national ? `+30${national}` : null;
  }
  if (digits.startsWith("30") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 10 && (digits.startsWith("6") || digits.startsWith("2"))) {
    return `+30${digits}`;
  }
  return null;
}

export type RetellDialPhoneFields = {
  phone?: string | null;
  phone2?: string | null;
  landline?: string | null;
};

/** Prefer first phone / phone2 / landline that formats to a valid Retell E.164 number. */
export function pickRetellDialPhone(c: RetellDialPhoneFields | null | undefined): string | null {
  if (!c) return null;
  for (const v of [c.phone, c.phone2, c.landline]) {
    const formatted = formatGreekPhoneForRetell(v);
    if (formatted) return formatted;
  }
  return null;
}

/**
 * Retell v2 `create-phone-call` request body. Uses `override_agent_id` (Retell API name).
 * See https://docs.retellai.com/api-references/create-phone-call
 *
 * Dynamic vars (`retell_llm_dynamic_variables`) are required so Single Prompt Agents can
 * interpolate {{first_name}} etc., and so the webhook can resolve contact_id.
 * `campaign_id` stays in metadata (and dynamic vars when present) for pending-call matching.
 *
 * Retell requires dynamic variables to be declared in Agent settings under
 * "Default Dynamic Variables"; otherwise Retell ignores them even when sent in the API body.
 */
function asRetellDynVar(value: string | null | undefined): string {
  return value == null ? "" : String(value);
}

export function buildCreatePhoneCallBody(
  toNumber: string,
  firstName: string,
  lastName: string,
  contactId: string,
  campaignId: string | null,
  overrideAgentId?: string | null,
): Record<string, unknown> {
  if (!process.env.RETELL_FROM_NUMBER) {
    throw new Error("Ρύθμιση Retell: λείπει RETELL_FROM_NUMBER");
  }
  const agent =
    (overrideAgentId != null && String(overrideAgentId).trim()) ||
    (process.env.RETELL_AGENT_ID ?? "").trim();
  if (!agent) {
    throw new Error("Ρύθμιση Retell: λείπει agent (τύπος καμπάνιας ή RETELL_AGENT_ID)");
  }
  // Always send string keys so Retell receives declared dynamic variables (never omit / null).
  const first_name = asRetellDynVar(firstName);
  const last_name = asRetellDynVar(lastName);
  const contact_id = asRetellDynVar(contactId);
  const campaign_id = campaignId == null ? null : asRetellDynVar(campaignId);
  return {
    from_number: process.env.RETELL_FROM_NUMBER,
    to_number: toNumber,
    override_agent_id: agent,
    metadata: {
      first_name,
      last_name,
      contact_id,
      campaign_id,
    },
    retell_llm_dynamic_variables: {
      first_name,
      last_name,
      contact_id,
      ...(campaign_id ? { campaign_id } : {}),
    },
  };
}
