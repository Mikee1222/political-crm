"use client";

import { useMemo, useState } from "react";
import { Users, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { getGroupChipStyle } from "@/lib/color-utils";
import { dedupeContactGroupsById, type ContactGroupRow } from "@/lib/contact-groups";
import type { ContactGroupSummary } from "@/lib/contact-group-members";

const inputSm =
  "h-9 w-full min-h-[44px] max-w-full rounded-lg border border-[var(--border)] px-2.5 text-sm text-[var(--text-primary)] focus:border-[#003476] focus:outline-none focus:ring-1 focus:ring-[#003476]/20 max-md:min-h-[48px] max-md:text-base";

type Props = {
  contactId: string;
  groups: ContactGroupSummary[];
  groupOptions: ContactGroupRow[];
  canManage: boolean;
  onGroupsChange: (groups: ContactGroupSummary[]) => void;
  onToast: (message: string, type: "success" | "error") => void;
};

export function ContactGroupsSection({
  contactId,
  groups,
  groupOptions,
  canManage,
  onGroupsChange,
  onToast,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [pickerValue, setPickerValue] = useState("");

  const memberIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);

  const addOptions = useMemo(() => {
    return dedupeContactGroupsById(groupOptions)
      .filter((g) => !memberIds.has(g.id))
      .map((g) => ({
        value: g.id,
        label: g.year != null ? `${g.name} (${g.year})` : g.name,
        group: g.category?.trim() || "Άλλο",
        color: g.color,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "el"));
  }, [groupOptions, memberIds]);

  const handleAdd = async (groupId: string) => {
    if (!canManage || !groupId || saving) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(contactId)}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        all_groups?: ContactGroupSummary[];
        error?: string;
      };
      if (!res.ok || !data.all_groups) {
        onToast(data.error ?? "Αποτυχία προσθήκης ομάδας", "error");
        return;
      }
      onGroupsChange(data.all_groups);
      setPickerValue("");
      onToast("Η ομάδα προστέθηκε.", "success");
    } catch {
      onToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (groupId: string) => {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout(
        `/api/contacts/${encodeURIComponent(contactId)}/groups/${encodeURIComponent(groupId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        all_groups?: ContactGroupSummary[];
        error?: string;
      };
      if (!res.ok || !data.all_groups) {
        onToast(data.error ?? "Αποτυχία αφαίρεσης ομάδας", "error");
        return;
      }
      onGroupsChange(data.all_groups);
      onToast("Η ομάδα αφαιρέθηκε.", "success");
    } catch {
      onToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="contact-card-in break-inside-avoid rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)]/95 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
        <h2 className="m-0 text-sm font-semibold text-[var(--text-primary)]">Ομάδες</h2>
      </div>

      {groups.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {groups.map((g) =>
            canManage ? (
              <button
                key={g.id}
                type="button"
                disabled={saving}
                onClick={() => void handleRemove(g.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                style={getGroupChipStyle(g.color)}
                title={g.description ?? undefined}
              >
                <span className="truncate">
                  {g.name}
                  {g.year != null ? ` · ${g.year}` : ""}
                </span>
                <X className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              </button>
            ) : (
              <span
                key={g.id}
                className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                style={getGroupChipStyle(g.color)}
                title={g.description ?? undefined}
              >
                {g.name}
                {g.year != null ? ` · ${g.year}` : ""}
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="mb-2 text-sm text-[var(--text-muted)]">Δεν έχουν οριστεί ομάδες.</p>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[12rem] flex-1">
            <SearchableSelect
              className={inputSm + " !pr-9"}
              value={pickerValue}
              onChange={(v) => {
                setPickerValue(v);
                if (v) void handleAdd(v);
              }}
              options={addOptions}
              placeholder="+ Προσθήκη ομάδας"
              searchPlaceholder="Αναζήτηση ομάδας..."
              emptyText="Δεν βρέθηκαν ομάδες"
              disabled={saving || addOptions.length === 0}
              aria-label="Προσθήκη ομάδας"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
