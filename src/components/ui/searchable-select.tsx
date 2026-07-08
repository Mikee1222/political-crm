"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Search, Check, ChevronDown, X, Loader2 } from "lucide-react";
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
  /** When true, show a spinner instead of the empty message (options still loading). */
  loading?: boolean;
  loadingText?: string;
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
  loading = false,
  loadingText = "Φόρτωση...",
  id,
  disabled,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const [search, setSearch] = useState("");
  const { triggerRef, panelRef, open, setOpen, pos } = usePortalDropdown({ minWidth: 240 });
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

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef as RefObject<HTMLButtonElement>}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else handleOpen();
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2.5 text-left text-sm transition-all",
          open
            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
            : "border-border hover:border-primary/40",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {selected?.color ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ background: selected.color }}
              aria-hidden
            />
          ) : null}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) onChange("");
              }}
              className="rounded-md p-0.5 transition-colors hover:bg-accent"
              aria-label="Καθαρισμός επιλογής"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" aria-hidden />
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>

      <PortalDropdownPanel
        open={open && !disabled}
        pos={pos}
        panelRef={panelRef}
        role="listbox"
        onMouseDown={(e) => e.stopPropagation()}
        className="rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="border-b border-border/60 p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-border/40 bg-muted/60 py-2 pl-9 pr-9 text-sm transition-colors focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              autoComplete="off"
              aria-label={searchPlaceholder}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Καθαρισμός αναζήτησης"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto py-1.5">
          <div
            role="option"
            aria-selected={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={cn(
              "mx-2 flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
              !value ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {!value ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            <span>{placeholder}</span>
          </div>

          {loading && grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8" role="status">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">{loadingText}</p>
            </div>
          ) : !loading && grouped.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            </div>
          ) : (
            grouped.map(([group, opts]) => (
              <div key={group || "__ungrouped"}>
                {group ? (
                  <div className="flex items-center gap-2 px-5 pb-1.5 pt-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                      {group}
                    </span>
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[10px] text-muted-foreground">{opts.length}</span>
                  </div>
                ) : null}

                {opts.map((opt) => (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={value === opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "group mx-2 flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                      value === opt.value
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    {opt.color ? (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ background: opt.color }}
                        aria-hidden
                      />
                    ) : (
                      <span className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {value === opt.value ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    ) : null}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="border-t border-border/60 bg-muted/20 px-4 py-2">
            <p className="text-[10px] text-muted-foreground">
              {filtered.length} αποτελέσματα
              {search ? ` για "${search}"` : ""}
            </p>
          </div>
        ) : null}
      </PortalDropdownPanel>
    </>
  );
}
