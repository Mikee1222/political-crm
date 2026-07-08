import type { FilterChip } from "@/components/search/active-filter-chips";
import type { ContactListFilters } from "@/lib/contacts-filters";
import type { RequestListFilters } from "@/lib/requests-filters";

const CONTACT_NAME_CHIP_KEYS = new Set(["first_name", "last_name"]);
const REQUEST_PERSON_CHIP_KEYS = new Set([
  "requester_contact_id",
  "affected_contact_id",
  "helper_contact_id",
]);

/**
 * Builds a single summary label for active search filters.
 * - Name-only contact search → "FIRST LAST"
 * - Single filter → that filter's chip label (search/person → plain text)
 * - Multiple filters → "N φίλτρα ενεργά"
 */
export function buildActiveFilterSummaryLabel(
  chips: FilterChip[],
  opts?: {
    contactFilters?: ContactListFilters;
    requestFilters?: RequestListFilters;
  },
): string | null {
  if (!chips.length) return null;

  if (chips.length > 1) {
    const nameOnly =
      opts?.contactFilters &&
      chips.every((c) => CONTACT_NAME_CHIP_KEYS.has(c.key));
    if (nameOnly) {
      const f = opts!.contactFilters!;
      const name = [f.first_name.trim(), f.last_name.trim()].filter(Boolean).join(" ");
      if (name) return name;
    }
    return `${chips.length} φίλτρα ενεργά`;
  }

  const [chip] = chips;
  if (!chip) return null;

  if (opts?.contactFilters && CONTACT_NAME_CHIP_KEYS.has(chip.key)) {
    const f = opts.contactFilters;
    const name = [f.first_name.trim(), f.last_name.trim()].filter(Boolean).join(" ");
    if (name) return name;
  }

  if (chip.key === "search") {
    const text =
      opts?.contactFilters?.search.trim() ||
      opts?.requestFilters?.search.trim() ||
      chip.label.replace(/^Αναζήτηση:\s*/u, "").trim();
    if (text) return text;
  }

  if (opts?.requestFilters && REQUEST_PERSON_CHIP_KEYS.has(chip.key)) {
    const f = opts.requestFilters;
    const name =
      (chip.key === "requester_contact_id" && f.requester_name.trim()) ||
      (chip.key === "affected_contact_id" && f.affected_name.trim()) ||
      (chip.key === "helper_contact_id" && f.helper_name.trim()) ||
      "";
    if (name) return name;
  }

  return chip.label;
}
