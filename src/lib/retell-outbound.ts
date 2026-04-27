/**
 * Retell v2 `create-phone-call` request body. Uses `override_agent_id` (Retell API name).
 * See https://docs.retellai.com/api-references/create-phone-call
 */
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
  const last = lastName.trim();
  return {
    from_number: process.env.RETELL_FROM_NUMBER,
    to_number: toNumber,
    override_agent_id: agent,
    metadata: {
      first_name: firstName,
      last_name: last,
      contact_id: contactId,
      campaign_id: campaignId,
    },
    retell_llm_dynamic_variables: {
      first_name: firstName,
      last_name: last,
      contact_id: contactId,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    },
  };
}
