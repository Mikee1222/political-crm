"use client";

import clsx from "clsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type ContactRow = { id: string; first_name: string; last_name: string; phone: string | null };

type Props = {
  label: string;
  valueId: string;
  onChange: (id: string, displayName?: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string | null;
  onBlurValidate?: () => void;
};

const DEBOUNCE_MS = 280;

function displayName(c: ContactRow) {
  return `${c.first_name} ${c.last_name}`.trim() || "—";
}

function phoneOf(c: ContactRow) {
  return c.phone?.trim() || null;
}

export function ContactSearchCombobox({
  label,
  valueId,
  onChange,
  required,
  placeholder = "Αναζήτηση ονόματος ή τηλεφώνου…",
  error,
  onBlurValidate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [list, setList] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (search: string) => {
    if (!search.trim() || search.trim().length < 1) {
      setList([]);
      return;
    }
    setLoading(true);
    try {
      const u = new URLSearchParams();
      u.set("search", search.trim());
      u.set("limit", "30");
      const res = await fetchWithTimeout(`/api/contacts?${u.toString()}`);
      const j = (await res.json()) as { contacts?: ContactRow[] };
      setList(j.contacts ?? []);
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
          setSelectedLabel(displayName(j.contact));
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
    if (debounced.trim().length < 1) {
      setList([]);
      return;
    }
    void load(debounced);
  }, [open, debounced, load]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
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
            className={clsx(lux.input, error && lux.inputError)}
            placeholder={placeholder}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => onBlurValidate?.()}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId + "list"}
            aria-invalid={error ? true : undefined}
          />
          {open && (
            <ul
              id={listId + "list"}
              className="absolute z-[60] mt-1 max-h-52 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 text-sm shadow-xl"
            >
              {loading && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Φόρτωση…</li>
              )}
              {!loading && debounced.trim().length < 1 && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Πληκτρολογήστε για αναζήτηση</li>
              )}
              {!loading && debounced.trim().length >= 1 && list.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Καμία επαφή</li>
              )}
              {list.map((c) => {
                const ph = phoneOf(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full cursor-pointer px-3 py-2.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                      onClick={() => {
                        onChange(c.id, displayName(c));
                        setSelectedLabel(displayName(c));
                        setOpen(false);
                        setQ("");
                        setList([]);
                      }}
                    >
                      <span className="font-medium">{displayName(c)}</span>
                      {ph && <span className="ml-2 text-xs text-[var(--text-muted)]">{ph}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
