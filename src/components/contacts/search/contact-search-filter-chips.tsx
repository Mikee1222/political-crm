"use client";

import { X } from "lucide-react";
import type { ContactListFilters } from "@/lib/contacts-filters";
import {
  CONTACT_SEARCH_AGE_GROUPS,
  EKL_AR_OPTIONS,
  GENDER_OPTIONS,
  HAS_REQUEST_OPTIONS,
  PRESENCE_OPTIONS,
} from "@/lib/contact-search-constants";
import { REQUEST_STATUSES } from "@/lib/request-statuses";

type Chip = { key: string; label: string };

function labelFor(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function buildContactSearchFilterChips(
  f: ContactListFilters,
  groupNames: Map<string, string>,
  sourceNames: Map<string, string>,
): Chip[] {
  const chips: Chip[] = [];
  const push = (key: string, label: string) => {
    if (label.trim()) chips.push({ key, label });
  };

  if (f.first_name.trim()) push("first_name", `Όνομα: ${f.first_name}`);
  if (f.last_name.trim()) push("last_name", `Επώνυμο: ${f.last_name}`);
  if (f.father_name.trim()) push("father_name", `Πατρώνυμο: ${f.father_name}`);
  if (f.gender) push("gender", `Φύλο: ${labelFor(GENDER_OPTIONS, f.gender)}`);
  const ageKey = Object.entries(CONTACT_SEARCH_AGE_GROUPS).find(
    ([, r]) => f.age_min === String(r.min) && f.age_max === String(r.max),
  )?.[0];
  if (ageKey) push("age", `Ηλικία: ${CONTACT_SEARCH_AGE_GROUPS[ageKey]!.label}`);
  if (f.birthday_today) push("birthday_today", "Γενέθλια σήμερα");
  if (f.nameday_today) push("nameday_today", "Ονομαστική σήμερα");
  f.municipalities.forEach((name) => push(`muni:${name}`, `Δήμος: ${name}`));
  f.toponyms.forEach((name) => push(`top:${name}`, `Τοπωνύμιο: ${name}`));
  if (f.phone) push("phone", `Τηλ.: ${f.phone}`);
  if (f.mobile_presence) push("mobile_presence", `Κινητό: ${labelFor(PRESENCE_OPTIONS, f.mobile_presence)}`);
  if (f.landline_presence) push("landline_presence", `Σταθερό: ${labelFor(PRESENCE_OPTIONS, f.landline_presence)}`);
  if (f.email_presence) push("email_presence", `Email: ${labelFor(PRESENCE_OPTIONS, f.email_presence)}`);
  f.group_ids.forEach((id) => push(`group:${id}`, `Ομάδα: ${groupNames.get(id) ?? id}`));
  f.exclude_group_ids.forEach((id) => push(`exgroup:${id}`, `Χωρίς ομάδα: ${groupNames.get(id) ?? id}`));
  if (f.group_ids.length > 1 && f.group_match === "and") push("group_match", "Ομάδες: ΚΑΙ");
  f.source_ids.forEach((id) => push(`src:${id}`, `Να έχει πηγή: ${sourceNames.get(id) ?? id}`));
  f.exclude_source_ids.forEach((id) => push(`exsrc:${id}`, `Να ΜΗΝ έχει: ${sourceNames.get(id) ?? id}`));
  if (f.ekl_ar) push("ekl_ar", `Εκλ. περιφ.: ${labelFor(EKL_AR_OPTIONS, f.ekl_ar)}`);
  if (f.electoral_district) push("electoral_district", `Εκλ. διαμ.: ${f.electoral_district}`);
  if (f.has_request) push("has_request", labelFor(HAS_REQUEST_OPTIONS, f.has_request));
  if (f.request_status) push("request_status", `Αίτημα: ${f.request_status}`);
  if (f.search.trim()) push("search", `Αναζήτηση: ${f.search}`);

  return chips;
}

export function ContactSearchFilterChips({
  chips,
  onDismiss,
}: {
  chips: Chip[];
  onDismiss: (key: string) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="crm-filter-chips-row">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_10%,var(--bg-elevated))] py-0.5 pl-2.5 pr-0.5 text-xs font-medium text-[var(--text-primary)]"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            className="inline-flex h-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            onClick={() => onDismiss(chip.key)}
            aria-label={`Αφαίρεση ${chip.label}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}

export { REQUEST_STATUSES };
