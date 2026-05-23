"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalDropdownPanel, usePortalDropdown } from "@/components/ui/portal-dropdown";

export type SearchableSelectOption = {
  value: string;
  label: string;
  group?: string;
  color?: string;
};

export type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  emptyText?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Επιλέξτε...",
  searchPlaceholder = "Αναζήτηση...",
  className,
  emptyText = "Δεν βρέθηκαν αποτελέσματα",
  id,
  disabled,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const [search, setSearch] = useState("");
  const { triggerRef, panelRef, open, setOpen, pos, toggle } = usePortalDropdown({ minWidth: 240 });
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const t = norm(search.trim());
    if (!t) return options;
    return options.filter((o) => norm(o.label).includes(t));
  }, [options, search]);

  const grouped = useMemo(() => {
    const acc: Record<string, SearchableSelectOption[]> = {};
    for (const opt of filtered) {
      const g = opt.group ?? "";
      if (!acc[g]) acc[g] = [];
      acc[g].push(opt);
    }
    const keys = Object.keys(acc).sort((a, b) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b, "el");
    });
    return keys.map((k) => [k, acc[k]!] as const);
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setSearch("");
      const t = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    toggle();
  };

  return (
    <>
      <div
        ref={triggerRef as RefObject<HTMLDivElement>}
        id={id}
        className={cn(
          "flex w-full items-center gap-1 rounded-xl border border-border bg-background px-1 py-1 text-sm transition-colors hover:border-primary/50",
          open && "border-primary ring-2 ring-primary/20",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={handleToggle}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1 text-left"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
            {selected?.color ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: selected.color }}
                aria-hidden
              />
            ) : null}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
        {value ? (
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="shrink-0 rounded p-1 hover:bg-muted"
            aria-label="Καθαρισμός επιλογής"
          >
            <X className="h-3 w-3 text-muted-foreground" aria-hidden />
          </button>
        ) : null}
      </div>

      <PortalDropdownPanel
        open={open && !disabled}
        pos={pos}
        panelRef={panelRef}
        role="listbox"
        className="overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg bg-muted py-1.5 pl-8 pr-3 text-sm focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              autoComplete="off"
              aria-label={searchPlaceholder}
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted",
              !value && "bg-muted/50",
            )}
          >
            — {placeholder} —
          </button>

          {grouped.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            grouped.map(([group, opts]) => (
              <div key={group || "__ungrouped"}>
                {group ? (
                  <div className="border-y border-border/50 bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                    {group}
                  </div>
                ) : null}
                {opts.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={value === opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                      value === opt.value && "bg-primary/10 font-medium text-primary",
                    )}
                  >
                    {opt.color ? (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: opt.color }}
                        aria-hidden
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {value === opt.value ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PortalDropdownPanel>
    </>
  );
}
