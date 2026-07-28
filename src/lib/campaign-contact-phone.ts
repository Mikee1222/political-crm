/** Contact phone fields used by campaign dial / list filtering. */
export type CampaignPhoneFields = {
  phone?: string | null;
  phone2?: string | null;
  landline?: string | null;
};

export function trimPhone(v: string | null | undefined): string {
  return (v ?? "").toString().trim();
}

/** True if at least one of phone / phone2 / landline is non-empty. */
export function contactHasAnyCampaignPhone(c: CampaignPhoneFields | null | undefined): boolean {
  if (!c) return false;
  return Boolean(trimPhone(c.phone) || trimPhone(c.phone2) || trimPhone(c.landline));
}

/** Prefer κινητό → κινητό 2 → σταθερό for outbound dial. */
export function pickCampaignDialPhone(c: CampaignPhoneFields | null | undefined): string | null {
  if (!c) return null;
  for (const v of [c.phone, c.phone2, c.landline]) {
    const t = trimPhone(v);
    if (t) return t;
  }
  return null;
}

export type CampaignPhoneLabels = {
  phone: string | null;
  phone2: string | null;
  landline: string | null;
};

export function campaignPhoneLabels(c: CampaignPhoneFields | null | undefined): CampaignPhoneLabels {
  return {
    phone: trimPhone(c?.phone) || null,
    phone2: trimPhone(c?.phone2) || null,
    landline: trimPhone(c?.landline) || null,
  };
}
