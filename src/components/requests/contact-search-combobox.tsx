"use client";

import clsx from "clsx";
import { useCallback, useEffect, useId, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { buildContactComboboxSearchParamSets } from "@/lib/alexandra-contact-search";
import { formatGreekContactName, formatGreekContactNameWithPhone } from "@/lib/contact-display-name";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { isUuid } from "@/lib/resolve-entity-id";
import { PortalDropdownPanel, usePortalDropdown } from "@/components/ui/portal-dropdown";

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  father_name?: string | null;
  phone: string | null;
};

type Props = {
  label: string;
  valueId: string;
  onChange: (id: string, displayName?: string) => void;
  /** Called after a valid UUID contact is picked from search results. */
  onSelect?: (id: string, displayName?: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string | null;
  onBlurValidate?: () => void;
  disabled?: boolean;
};

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

function displayLabel(c: ContactRow) {
  return formatGreekContactName(c.last_name, c.first_name, c.father_name);
}

function resultLabel(c: ContactRow) {
  return formatGreekContactNameWithPhone(c.last_name, c.first_name, c.father_name, c.phone);
}

function mergeContactRows(lists: ContactRow[][]): ContactRow[] {
  const seen = new Set<string>();
  const out: ContactRow[] = [];
  for (const list of lists) {
    for (const c of list) {
      const id = String(c.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(c);
    }
  }
  return out;
}

export function ContactSearchCombobox({
  label,
  valueId,
  onChange,
  onSelect,
  required,
  placeholder = "Αναζήτηση ονόματος ή τηλεφώνου…",
  error,
  onBlurValidate,
  disabled,
}: Props) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [list, setList] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const listId = useId();
  const { triggerRef, panelRef, open, setOpen, pos } = usePortalDropdown();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (search: string) => {
    const trimmed = search.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setList([]);
      return;
    }
    setLoading(true);
    try {
      const paramSets = buildContactComboboxSearchParamSets(trimmed);
      const results = await Promise.all(
        paramSets.map(async (u) => {
          const res = await fetchWithTimeout(`/api/contacts?${u.toString()}`);
          const j = (await res.json()) as { contacts?: ContactRow[] };
          return j.contacts ?? [];
        }),
      );
      setList(mergeContactRows(results));
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!valueId) {
      setSelectedLabel("");
      return;
    }
    let gone = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(`/api/contacts/${valueId}`);
        if (!res.ok) return;
        const j = (await res.json()) as { contact?: ContactRow };
        if (j.contact && !gone) {
          setSelectedLabel(displayLabel(j.contact));
        }
      } catch {
        /* keep label empty */
      }
    })();
    return () => {
      gone = true;
    };
  }, [valueId]);

  useEffect(() => {
    if (!open) return;
    if (debounced.trim().length < MIN_QUERY_LEN) {
      setList([]);
      return;
    }
    void load(debounced);
  }, [open, debounced, load]);

  const bindTriggerRef = (el: HTMLInputElement | null) => {
    triggerRef.current = el;
  };

  const pickContact = (c: ContactRow) => {
    const contactUuid = String(c.id ?? "").trim();
    if (!isUuid(contactUuid)) {
      console.warn("[ContactSearchCombobox] ignored non-UUID contact id:", c.id);
      return;
    }
    const name = displayLabel(c);
    onChange(contactUuid, name);
    onSelect?.(contactUuid, name);
    setSelectedLabel(name);
    setOpen(false);
    setQ("");
    setList([]);
  };

  const queryTooShort = debounced.trim().length > 0 && debounced.trim().length < MIN_QUERY_LEN;

  return (
    <div className="relative">
      <label className={lux.label} htmlFor={listId + "in"}>
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {valueId ? (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <p
            className={clsx(
              "min-h-[42px] w-full flex-1 rounded-lg border bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-input)]",
              error ? "border-[var(--danger)]" : "border-[var(--border)]",
            )}
          >
            <span className="font-medium">{selectedLabel || "Φόρτωση…"}</span>
          </p>
          <button
            type="button"
            className={lux.btnSecondary + " shrink-0 !py-2.5"}
            onClick={() => {
              onChange("", "");
              setQ("");
              setList([]);
            }}
          >
            Αφαίρεση
          </button>
        </div>
      ) : (
        <>
          <input
            id={listId + "in"}
            ref={bindTriggerRef}
            className={clsx(lux.input, error && lux.inputError)}
            placeholder={placeholder}
            value={q}
            onChange={(e) => {
              if (disabled) return;
              setQ(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => !disabled && setOpen(true)}
            onBlur={() => onBlurValidate?.()}
            autoComplete="off"
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId + "list"}
            aria-invalid={error ? true : undefined}
          />
          <PortalDropdownPanel
            open={open}
            pos={pos}
            panelRef={panelRef}
            onMouseDown={(e) => e.preventDefault()}
            className="max-h-52 border border-border bg-background py-1 text-sm shadow-xl"
          >
            <ul id={listId + "list"} className="m-0 list-none p-0">
              {loading && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Φόρτωση…</li>
              )}
              {!loading && debounced.trim().length < 1 && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Πληκτρολογήστε για αναζήτηση</li>
              )}
              {!loading && queryTooShort && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Τουλάχιστον 2 χαρακτήρες</li>
              )}
              {!loading && debounced.trim().length >= MIN_QUERY_LEN && list.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Καμία επαφή</li>
              )}
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full cursor-pointer px-3 py-2.5 text-left text-[var(--text-primary)] transition-colors hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickContact(c);
                    }}
                  >
                    <span className="font-medium">{resultLabel(c)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PortalDropdownPanel>
        </>
      )}
      {error ? (
        <p className={lux.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
