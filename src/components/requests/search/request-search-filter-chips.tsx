"use client";

import { X } from "lucide-react";
import type { RequestListFilters } from "@/lib/requests-filters";
import { REQUEST_STATUSES } from "@/lib/request-statuses";

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
  if (f.requester_name.trim()) push("requester_name", `Αιτών: ${f.requester_name}`);
  if (f.affected_name.trim()) push("affected_name", `Επηρεαζόμενος: ${f.affected_name}`);
  if (f.helper_name.trim()) push("helper_name", `Βοηθός: ${f.helper_name}`);
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
}: {
  chips: Chip[];
  onDismiss: (key: string) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_10%,var(--bg-elevated))] py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-[var(--text-primary)]"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            className="rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            onClick={() => onDismiss(chip.key)}
            aria-label={`Αφαίρεση ${chip.label}`}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}

export { REQUEST_STATUSES };
