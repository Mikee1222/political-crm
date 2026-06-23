"use client";

import { ActiveFilterChips } from "@/components/search/active-filter-chips";
import type { RequestListFilters } from "@/lib/requests-filters";

type Chip = { key: string; label: string };

export function buildRequestSearchFilterChips(
  f: RequestListFilters,
  categoryNames: Map<string, string>,
  handlerNames: Map<string, string>,
): Chip[] {
  const chips: Chip[] = [];
  const push = (key: string, label: string) => {
    if (label.trim()) chips.push({ key, label });
  };

  if (f.search.trim()) push("search", `Αναζήτηση: ${f.search}`);
  if (f.status) push("status", `Κατάσταση: ${f.status}`);
  f.category_ids.forEach((id) =>
    push(`cat:${id}`, `Κατηγορία: ${categoryNames.get(id) ?? id}`),
  );
  f.exclude_category_ids.forEach((id) =>
    push(`excat:${id}`, `Χωρίς κατηγορία: ${categoryNames.get(id) ?? id}`),
  );
  if (f.requester_contact_id || f.requester_name.trim()) {
    push("requester_contact_id", `Αιτών: ${f.requester_name.trim() || f.requester_contact_id}`);
  }
  if (f.affected_contact_id || f.affected_name.trim()) {
    push("affected_contact_id", `Επηρεαζόμενος: ${f.affected_name.trim() || f.affected_contact_id}`);
  }
  if (f.helper_contact_id || f.helper_name.trim()) {
    push("helper_contact_id", `Βοηθός: ${f.helper_name.trim() || f.helper_contact_id}`);
  }
  if (f.request_code.trim()) push("request_code", `Κωδικός: ${f.request_code}`);
  if (f.handler_id) push("handler_id", `Υπεύθυνος: ${handlerNames.get(f.handler_id) ?? f.handler_id}`);
  if (f.notes.trim()) push("notes", `Σημειώσεις: ${f.notes}`);
  if (f.created_from) push("created_from", `Από: ${f.created_from}`);
  if (f.created_to) push("created_to", `Έως: ${f.created_to}`);

  return chips;
}

export function RequestSearchFilterChips({
  chips,
  onDismiss,
  onClearAll,
}: {
  chips: Chip[];
  onDismiss: (key: string) => void;
  onClearAll?: () => void;
}) {
  return <ActiveFilterChips chips={chips} onDismiss={onDismiss} onClearAll={onClearAll} />;
}

export { REQUEST_STATUSES } from "@/lib/request-statuses";
