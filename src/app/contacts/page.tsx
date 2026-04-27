"use client";

import { ChevronDown, Download, Pencil, Phone, Plus, Search, User } from "lucide-react";
import { ContactsImportWizard } from "@/components/contacts-import-wizard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { MUNICIPALITIES } from "@/lib/aitoloakarnania-data";
import {
  getDefaultContactFilters,
  searchParamsToFilters,
  buildContactsPageUrl,
  contactFiltersToExportParams,
  contactFiltersToSearchParams,
  applySavedFilterJson,
  type ContactListFilters,
} from "@/lib/contacts-filters";
import { useProfile } from "@/contexts/profile-context";
import { AitoloakarnaniaLocationFields } from "@/components/aitoloakarnania-location-fields";
import { hasMinRole } from "@/lib/roles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { avatarContact, callStatusLabel, lux } from "@/lib/luxury-styles";
import type { ContactGroupRow } from "@/lib/contact-groups";
import { PageHeader } from "@/components/ui/page-header";
import { CrmErrorBoundary } from "@/components/crm-error-boundary";

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  phone2?: string | null;
  landline?: string | null;
  area: string | null;
  municipality: string | null;
  call_status: string | null;
  priority: string | null;
  tags: string[] | null;
  contact_code?: string | null;
  group_id?: string | null;
  predicted_score?: number | null;
  father_name?: string | null;
  name_day?: string | null;
  contact_groups?: Pick<ContactGroupRow, "id" | "name" | "color" | "description" | "year"> | null;
};

/** e.g. "23 Απρ" for recurring name_day (YYYY-MM-DD) */
function formatNameDayGreek(iso: string | null | undefined): string | null {
  if (!iso || !String(iso).trim()) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("el-GR", { day: "numeric", month: "short" });
}

function weekStartMondayTime(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + toMon);
  return x.getTime();
}

/** Gold in table when the nameday (month/day) is today or falls in the current week (Mon–Sun). */
function isNameDayTodayOrThisWeek(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const p = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!p) return false;
  const mo = Number(p[2]) - 1;
  const day = Number(p[3]);
  const now = new Date();
  const y = now.getFullYear();
  const occ = new Date(y, mo, day);
  if (occ.getMonth() !== mo) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (occ.getTime() === today.getTime()) return true;
  return weekStartMondayTime(occ) === weekStartMondayTime(today);
}

function priorityDotClass(pr: string | null | undefined) {
  const p = pr ?? "Medium";
  if (p === "High") return "bg-red-500";
  if (p === "Low") return "bg-zinc-400";
  return "bg-amber-500";
}

function callStatusAvatarRingClass(st: string | null | undefined) {
  const s = st ?? "Pending";
  if (s === "Positive") return "bg-emerald-500";
  if (s === "Negative") return "bg-red-500";
  return "bg-zinc-400";
}

function GroupPillWithHint({ g }: { g: NonNullable<Contact["contact_groups"]> }) {
  const border = g.color || "#003476";
  return (
    <span className="inline-flex max-w-full shrink-0 items-center gap-0.5">
      <span
        className="inline-flex max-w-[7.5rem] truncate rounded-full border px-1.5 py-px text-[9px] font-semibold"
        style={{
          borderColor: border,
          color: border,
          background: "var(--bg-elevated)",
        }}
        title={g.name}
      >
        {g.name}
      </span>
      {g.description ? (
        <span
          className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[8px] font-bold leading-none text-[var(--text-secondary)]"
          title={g.description}
        >
          ?
        </span>
      ) : null}
    </span>
  );
}

type Camp = { id: string; name: string };

function ContactSwipeCard({
  c,
  onCall,
  onOpenDetail,
}: {
  c: Contact;
  onCall: () => void;
  onOpenDetail: () => void;
}) {
  const pr = c.priority ?? "Medium";
  const skipNav = useRef(false);
  const touch0 = useRef<{ x: number; moved: boolean } | null>(null);

  return (
    <div
      className="relative touch-pan-y overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-md"
      onTouchStart={(e) => {
        touch0.current = { x: e.touches[0].clientX, moved: false };
      }}
      onTouchMove={(e) => {
        const t = touch0.current;
        if (t && Math.abs(e.touches[0].clientX - t.x) > 14) t.moved = true;
      }}
      onTouchEnd={(e) => {
        const t0 = touch0.current;
        touch0.current = null;
        if (!t0) return;
        const d = e.changedTouches[0].clientX - t0.x;
        if (t0.moved && d > 48) {
          skipNav.current = true;
          onCall();
          return;
        }
        if (t0.moved && d < -48) {
          skipNav.current = true;
          onOpenDetail();
        }
      }}
      onClick={() => {
        if (skipNav.current) {
          skipNav.current = false;
          return;
        }
        onOpenDetail();
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 flex max-md:select-none" aria-hidden>
        <div className="flex w-14 shrink-0 items-center justify-center" style={{ background: "linear-gradient(90deg, rgba(201,168,76,0.3), transparent)" }}>
          <span className="text-[9px] font-bold uppercase text-[var(--accent-gold)] [writing-mode:vertical-rl]">Κλήση</span>
        </div>
        <div className="min-w-0 flex-1" />
        <div
          className="flex w-14 shrink-0 items-center justify-center"
          style={{ background: "linear-gradient(270deg, rgba(0,52,118,0.35), transparent)" }}
        >
          <Pencil className="h-4 w-4 text-[var(--accent-blue-bright)]" aria-hidden />
        </div>
      </div>
      <div className="relative z-[1] flex min-h-[4.5rem] min-w-0 items-center gap-3 p-3 pl-2 pr-2">
        <div className="relative shrink-0">
          <div className={avatarContact + " !h-12 !w-12 text-sm"}>
            {`${(c.first_name[0] ?? "?").toUpperCase()}${(c.last_name[0] ?? "?").toUpperCase()}`}
          </div>
          <span
            className={`absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-card)] ${callStatusAvatarRingClass(c.call_status)}`}
            title={callStatusLabel(c.call_status)}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1 pr-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${priorityDotClass(c.priority)}`}
              title={pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
            />
            <span className="min-w-0 font-semibold text-[var(--text-primary)]">
              {c.first_name} {c.last_name}
            </span>
            {c.contact_code ? (
              <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] font-normal text-[var(--text-muted)]">
                {c.contact_code}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 font-mono text-[13px] text-[var(--text-secondary)]">
            <span className="block">{c.phone || "—"}</span>
            {c.phone2?.trim() ? <span className="block text-[11px] text-[var(--text-muted)]">{c.phone2}</span> : null}
            {c.landline?.trim() ? (
              <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]" title="Σταθερό">
                {c.landline}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">
            {[c.municipality, c.area].filter(Boolean).join(" · ") || "—"}
            {c.contact_groups ? <span className="ml-1.5 font-medium text-[var(--text-secondary)]">· {c.contact_groups.name}</span> : null}
            {formatNameDayGreek(c.name_day) ? (
              <span className="ml-1.5 font-medium text-[#C9A84C]">· {formatNameDayGreek(c.name_day)}</span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

const CALL_STATUS_OPTS: { v: string; l: string }[] = [
  { v: "Pending", l: "Αναμονή" },
  { v: "Positive", l: "Θετικός" },
  { v: "Negative", l: "Αρνητικός" },
  { v: "No Answer", l: "Δεν απάντησε" },
];

function GroupMultiSelect({
  id,
  label,
  value,
  groups,
  onChange,
  emptyLabel,
}: {
  id: string;
  label: string;
  value: string[];
  groups: ContactGroupRow[];
  onChange: (v: string[]) => void;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const selected = groups.filter((g) => value.includes(g.id));
  const labelText =
    selected.length === 0
      ? emptyLabel
      : selected.length === 1
        ? selected[0]!.name
        : `${selected.length} επιλογές`;
  const toggle = (idG: string) => {
    if (value.includes(idG)) onChange(value.filter((x) => x !== idG));
    else onChange([...value, idG]);
  };
  return (
    <div className="relative w-full min-w-0 max-w-full" ref={ref}>
      <span className={lux.label} id={id + "-label"}>
        {label}
      </span>
      <button
        type="button"
        id={id}
        className={lux.select + " mt-1 flex w-full min-w-0 items-center justify-between gap-2 text-left"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-labelledby={id + "-label"}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)]">{labelText}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <ul
          className="absolute left-0 right-0 z-40 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[var(--card-shadow)]"
          role="listbox"
          aria-multiselectable
        >
          {groups.map((g) => {
            const on = value.includes(g.id);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  onClick={() => toggle(g.id)}
                >
                  <span
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                      (on ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/20" : "border-[var(--border)]")
                    }
                    aria-hidden
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border)]"
                    style={{ background: g.color || "#003476" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {g.name}
                    {g.year != null ? <span className="text-[var(--text-muted)]"> ({g.year})</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CallStatusMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const labelText =
    value.length === 0
      ? "Όλες"
      : value.length === 1
        ? CALL_STATUS_OPTS.find((o) => o.v === value[0])?.l ?? value[0]!
        : `${value.length} status`;
  const toggle = (s: string) => {
    if (value.includes(s)) onChange(value.filter((x) => x !== s));
    else onChange([...value, s]);
  };
  return (
    <div className="relative min-w-0 max-w-full" ref={ref}>
      <label className={lux.label} htmlFor="f-call-m">
        Κατάσταση
      </label>
      <button
        type="button"
        id="f-call-m"
        className={lux.select + " flex w-full min-w-0 items-center justify-between gap-2 text-left"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)]">{labelText}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <ul
          className="absolute z-30 mt-1 max-h-48 min-w-[11rem] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-[var(--card-shadow)]"
          role="listbox"
        >
          {CALL_STATUS_OPTS.map((o) => {
            const on = value.includes(o.v);
            return (
              <li key={o.v}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-elevated)]"
                  onClick={() => toggle(o.v)}
                >
                  <span
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                      (on ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/20" : "border-[var(--border)]")
                    }
                  >
                    {on ? "✓" : ""}
                  </span>
                  {o.l}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SavedFilterApi = { id: string; name: string; description: string | null; filters: Record<string, unknown> };

function ContactsPage() {
  const { profile } = useProfile();
  const canManage = hasMinRole(profile?.role, "manager");
  const isAdmin = profile?.role === "admin";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [f, setF] = useState<ContactListFilters>(getDefaultContactFilters);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const pageSize = 50;
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilterApi[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Pending");
  const [bulkCampaign, setBulkCampaign] = useState("");
  const [campaigns, setCampaigns] = useState<Camp[]>([]);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkWaMessage, setBulkWaMessage] = useState("");
  const filtersUrlKeyRef = useRef<string | null>(null);

  const groupNameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.name.toLowerCase(), g.id);
    return m;
  }, [groups]);

  const patch = useCallback(
    (p: Partial<ContactListFilters>) => {
      setF((prev) => {
        const next: ContactListFilters = { ...prev, ...p };
        const anyNonPage = Object.keys(p).length > 0 && Object.keys(p).some((k) => k !== "page");
        if (anyNonPage) {
          next.page = "1";
        }
        startTransition(() => {
          router.replace(buildContactsPageUrl(next), { scroll: false });
        });
        return next;
      });
    },
    [router],
  );

  const searchKey = useMemo(() => searchParams.toString(), [searchParams]);
  useLayoutEffect(() => {
    if (filtersUrlKeyRef.current === searchKey) return;
    filtersUrlKeyRef.current = searchKey;
    setF(searchParamsToFilters(new URLSearchParams(searchKey), getDefaultContactFilters()));
  }, [searchKey]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    if (canManage) setOpenCreate(true);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("new");
    const q = p.toString();
    startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }, [searchParams, router, pathname, canManage]);

  const load = useCallback(async () => {
    const q = f;
    const params = contactFiltersToSearchParams(q);
    params.set("page", q.page || "1");
    params.set("page_size", String(pageSize));
    try {
      const res = await fetchWithTimeout(`/api/contacts?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as { contacts?: Contact[]; total?: number };
      if (!res.ok) {
        setContacts([]);
        setListTotal(0);
        return;
      }
      const list = (data.contacts ?? []).map((c) => {
        const g = c.contact_groups;
        const contact_groups = Array.isArray(g) ? g[0] ?? null : g ?? null;
        return { ...c, contact_groups } as Contact;
      });
      setContacts(list);
      setListTotal(typeof data.total === "number" ? data.total : list.length);
    } catch {
      setContacts([]);
      setListTotal(0);
    }
  }, [f, pageSize]);

  useEffect(() => {
    fetchWithTimeout("/api/groups")
      .then((r) => r.json())
      .then((d: { groups?: ContactGroupRow[] }) => setGroups(d.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    fetchWithTimeout("/api/saved-filters")
      .then((r) => r.json())
      .then((d: { saved_filters?: SavedFilterApi[] }) => setSavedFilters(d.saved_filters ?? []))
      .catch(() => setSavedFilters([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    fetchWithTimeout("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setCampaigns((d.campaigns as Camp[] | undefined) ?? []);
      })
      .catch(() => setCampaigns([]));
  }, [canManage]);

  const areas = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.area).filter(Boolean))) as string[],
    [contacts],
  );

  const currentPage = Math.max(1, parseInt(f.page || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const rangeFrom = listTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeTo = Math.min(currentPage * pageSize, listTotal);
  const pageList = (() => {
    const last = totalPages;
    if (last <= 7) {
      return Array.from({ length: last }, (_, i) => i + 1);
    }
    const r: number[] = [];
    let end = Math.min(last, currentPage + 2);
    const start = Math.max(1, end - 4);
    if (end - start < 4) {
      end = Math.min(last, start + 4);
    }
    for (let i = start; i <= end; i += 1) {
      r.push(i);
    }
    return r;
  })();

  const selectedIds = [...selected];
  const allChecked = contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  const triggerCall = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetchWithTimeout("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: id }),
    });
  };

  const triggerCallById = async (id: string) => {
    await fetchWithTimeout("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: id }),
    });
  };

  const postBulk = async (
    action: "update_status" | "add_to_campaign" | "delete" | "send_whatsapp",
    value?: string,
  ) => {
    if (!selectedIds.length) return;
    setBulkErr(null);
    setSaving(true);
    try {
      const res = await fetchWithTimeout("/api/contacts/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: selectedIds, action, value: value ?? "" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setBulkErr(j.error ?? "Σφάλμα");
        return;
      }
      setSelected(new Set());
      if (action === "delete") setDeleteOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 pb-24 md:pb-6">
      {f.nameday_today && (
        <div
          className="flex w-full min-w-0 max-w-full flex-col gap-2 rounded-2xl border-2 border-[var(--accent-gold)]/45 bg-gradient-to-r from-[rgba(201,168,76,0.12)] to-[var(--bg-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-semibold text-[var(--accent-gold)]">Φίλτρο:</span> επαφές που{" "}
            <span className="text-[var(--text-secondary)]">εορτάζουν σήμερα</span> (ονομαστική σύνδεση εορτολογίου).
          </p>
          <button
            type="button"
            onClick={() => patch({ nameday_today: false })}
            className={lux.btnSecondary + " !shrink-0 !py-2 text-xs sm:!text-sm"}
          >
            Εμφάνιση όλων
          </button>
        </div>
      )}
      <PageHeader
        title="Επαφές"
        subtitle="Διαχείριση εκλογικής βάσης — αναζήτηση, φίλτρα, εξαγωγή και μαζικές ενέργειες."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                className={lux.btnSecondary + " !py-2 text-sm inline-flex items-center gap-1"}
                aria-expanded={exportOpen}
              >
                <Download className="h-4 w-4" />
                Εξαγωγή
                <ChevronDown className="h-4 w-4 opacity-60" />
              </button>
              {exportOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-xl"
                  role="menu"
                >
                  {canManage && (
                    <a
                      className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                      href="/api/contacts/export"
                    >
                      Εξαγωγή όλων
                    </a>
                  )}
                  <a
                    className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    href={`/api/contacts/export?${contactFiltersToExportParams(f).toString()}`}
                  >
                    Εξαγωγή φίλτρων
                  </a>
                  <a
                    className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    href={selectedIds.length ? `/api/contacts/export?${new URLSearchParams({ ids: selectedIds.join(",") }).toString()}` : "#"}
                    onClick={(e) => {
                      if (!selectedIds.length) e.preventDefault();
                    }}
                  >
                    Εξαγωγή επιλεγμένων
                  </a>
                </div>
              )}
            </div>
            {canManage && (
              <>
                <a href="/api/contacts/import-template" className={lux.btnSecondary + " !py-2 text-sm"}>
                  CSV Template
                </a>
                <button
                  type="button"
                  onClick={() => setOpenCreate(true)}
                  className={lux.btnPrimary + " hq-shimmer-gold !rounded-full !py-2.5 text-sm !font-bold text-[var(--text-badge-on-gold)]"}
                >
                  <Plus className="h-4 w-4" />
                  Νέα Επαφή
                </button>
              </>
            )}
          </div>
        }
      />

      <div className={lux.card + " !py-4 w-full min-w-0 max-w-full"}>
        <div className="mb-3 min-w-0 max-w-full sm:max-w-md">
          <label className={lux.label} htmlFor="f-saved-m">
            Αποθηκευμένα φίλτρα
          </label>
          <select
            id="f-saved-m"
            className={lux.select}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.currentTarget.value = "";
              if (!v) return;
              const row = savedFilters.find((r) => r.id === v);
              if (row) {
                const next = applySavedFilterJson(row.filters, groupNameToId);
                setF(next);
                startTransition(() => router.replace(buildContactsPageUrl(next), { scroll: false }));
              }
            }}
          >
            <option value="">— επιλέξτε —</option>
            {savedFilters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.description ? ` — ${s.description}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,11.5rem),1fr))]">
          <div className="min-w-0 max-w-full sm:col-span-2">
            <label className={lux.label} htmlFor="f-search">
              Αναζήτηση
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                id="f-search"
                className={lux.input + " !h-12 !rounded-full !pl-10 !pr-4 hq-input-elevated text-base sm:!text-sm"}
                placeholder="Όνομα, τηλέφωνο, δήμος…"
                value={f.search}
                onChange={(e) => patch({ search: e.target.value })}
                autoComplete="off"
              />
            </div>
            {(f.call_statuses.length > 0 ||
              f.municipality ||
              f.area ||
              f.priority ||
              f.search ||
              f.tag) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.search.trim() ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-primary)]">
                    Ζ: {f.search}
                  </span>
                ) : null}
                {f.municipality ? (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                    {f.municipality}
                  </span>
                ) : null}
                {f.area ? (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                    {f.area}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div className="min-w-0 max-w-full">
            <CallStatusMultiSelect
              value={f.call_statuses.length ? f.call_statuses : f.call_status ? [f.call_status] : []}
              onChange={(v) => {
                patch({ call_statuses: v, call_status: "" });
              }}
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-area">
              Περιοχή
            </label>
            <select
              id="f-area"
              className={lux.select}
              value={f.area}
              onChange={(e) => patch({ area: e.target.value })}
            >
              <option value="">Όλες</option>
              {areas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-muni">
              Δήμος
            </label>
            <select
              id="f-muni"
              className={lux.select}
              value={f.municipality}
              onChange={(e) => patch({ municipality: e.target.value })}
            >
              <option value="">Όλοι</option>
              {MUNICIPALITIES.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-pri">
              Προτεραιότητα
            </label>
            <select
              id="f-pri"
              className={lux.select}
              value={f.priority}
              onChange={(e) => patch({ priority: e.target.value })}
            >
              <option value="">Όλες</option>
              <option value="High">Υψηλή</option>
              <option value="Medium">Μεσαία</option>
              <option value="Low">Χαμηλή</option>
            </select>
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-tag">
              Ετικέτα
            </label>
            <input
              id="f-tag"
              className={lux.input}
              placeholder="Φίλτρο tag"
              value={f.tag}
              onChange={(e) => patch({ tag: e.target.value })}
            />
          </div>
          <div className="min-w-0 max-w-full sm:col-span-2">
            <GroupMultiSelect
              id="f-groups"
              label="Ομάδα"
              value={f.group_ids.length ? f.group_ids : f.group_id ? [f.group_id] : []}
              groups={groups}
              onChange={(ids) => {
                patch({
                  group_ids: ids,
                  group_id: "",
                });
              }}
              emptyLabel="Όλες οι ομάδες"
            />
          </div>
          <div className="min-w-0 max-w-full sm:col-span-2">
            <GroupMultiSelect
              id="f-groups-ex"
              label="Εξαίρεση ομάδας"
              value={f.exclude_group_ids}
              groups={groups}
              onChange={(ids) => patch({ exclude_group_ids: ids })}
              emptyLabel="Χωρίς εξαίρεση"
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-byrf">
              Έτος γέννησης από
            </label>
            <input
              id="f-byrf"
              className={lux.input}
              inputMode="numeric"
              placeholder="π.χ. 1960"
              value={f.birth_year_from}
              onChange={(e) => patch({ birth_year_from: e.target.value.replace(/[^\d]/g, "") })}
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-byrt">
              Έτος γέννησης έως
            </label>
            <input
              id="f-byrt"
              className={lux.input}
              inputMode="numeric"
              placeholder="π.χ. 1990"
              value={f.birth_year_to}
              onChange={(e) => patch({ birth_year_to: e.target.value.replace(/[^\d]/g, "") })}
            />
          </div>
          <div className="min-w-0 max-w-full">
            <label className={lux.label} htmlFor="f-score">
              Σκορ (πειθω)
            </label>
            <select
              id="f-score"
              className={lux.select}
              value={f.score_tier}
              onChange={(e) => patch({ score_tier: e.target.value })}
            >
              <option value="">Όλα</option>
              <option value="low">0–33 (χαμηλό)</option>
              <option value="mid">34–66 (μέτριο)</option>
              <option value="high">67–100 (υψηλό)</option>
            </select>
          </div>
          {canManage && (
            <div className="min-w-0 max-w-full flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={f.is_volunteer}
                  onChange={(e) => patch({ is_volunteer: e.target.checked })}
                />
                Μόνο εθελοντές
              </label>
            </div>
          )}
        </div>
      </div>

      {canManage && <ContactsImportWizard onImported={load} />}

      {contacts.length > 0 && (
        <div className="md:hidden">
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <ContactSwipeCard
                  c={c}
                  onCall={() => void triggerCallById(c.id)}
                  onOpenDetail={() => router.push(`/contacts/${c.id}`)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="data-hq-card hq-table-shell hq-table-contacts relative hidden w-full min-w-0 max-w-full min-h-0 overflow-x-auto md:block max-h-[min(70vh,900px)]"
      >
        {/*
          Exactly 8 columns: (1) checkbox (2) avatar+name+code (3) phone (4) municipality
          (5) group (6) nameday (7) patronymic (8) actions — same count in thead and every tbody tr.
        */}
        <table className="w-full min-w-[930px] table-fixed text-sm text-[var(--text-table)]">
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th
                scope="col"
                className="sticky left-0 top-0 z-[32] w-10 min-w-10 max-w-10 border-r border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-left align-middle"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={allChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (allChecked) setSelected(new Set());
                    else setSelected(new Set(contacts.map((x) => x.id)));
                  }}
                  title="Επιλογή όλων"
                  aria-label="Επιλογή όλων"
                />
              </th>
              <th
                scope="col"
                className="sticky left-10 top-0 z-[31] w-60 min-w-60 max-w-60 border-r border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-left align-middle font-medium text-[var(--text-table-header)]"
              >
                Επαφή
              </th>
              <th scope="col" className="w-[140px] px-4 py-3 text-left align-middle font-medium text-[var(--text-table-header)]">
                Τηλέφωνο
              </th>
              <th scope="col" className="w-[120px] px-4 py-3 text-left align-middle font-medium text-[var(--text-table-header)]">
                Δήμος
              </th>
              <th scope="col" className="w-[100px] px-4 py-3 text-left align-middle font-medium text-[var(--text-table-header)]">
                Ομάδα
              </th>
              <th scope="col" className="w-[90px] px-4 py-3 text-left align-middle font-medium text-[var(--text-table-header)]">
                Γιορτή
              </th>
              <th scope="col" className="w-[120px] px-4 py-3 text-left align-middle font-medium text-[var(--text-table-header)]">
                Πατρώνυμο
              </th>
              <th scope="col" className="w-20 px-4 py-3 text-right align-middle" aria-label="Ενέργειες" />
            </tr>
          </thead>
          <tbody>
            {contacts.map((c, rowIdx) => {
              const rowBg = rowIdx % 2 === 0 ? "bg-[var(--bg-card)]" : "bg-[var(--bg-elevated)]/35";
              const nameDay = formatNameDayGreek(c.name_day);
              const nameDayGold = isNameDayTodayOrThisWeek(c.name_day);
              const cellHover = `${rowBg} group-hover/contact-row:bg-[var(--bg-elevated)]/50`;
              return (
                <tr
                  key={c.id}
                  className={
                    "group/contact-row border-b border-l-2 border-l-transparent border-b-[var(--border)] text-[var(--text-table)] transition-[border-color,background-color] duration-200 last:border-0 hover:border-l-[#C9A84C] " +
                    rowBg
                  }
                  onClick={() => router.push(`/contacts/${c.id}`)}
                >
                  <td
                    className={`sticky left-0 z-[22] w-10 min-w-10 max-w-10 border-r border-[var(--border)] px-4 py-3 align-middle ${cellHover}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)]"
                      checked={selected.has(c.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const n = new Set(prev);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      aria-label={`Επιλογή ${c.first_name} ${c.last_name}`}
                    />
                  </td>
                  <td
                    className={`sticky left-10 z-[21] w-60 min-w-60 max-w-60 border-r border-[var(--border)] px-4 py-3 align-middle ${cellHover}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="flex w-full min-w-0 max-w-full items-center gap-2.5 text-left"
                      onClick={() => router.push(`/contacts/${c.id}`)}
                    >
                      <div className="relative h-9 w-9 shrink-0 [flex-shrink:0]">
                        <div
                          className={
                            avatarContact +
                            " !flex !h-9 !w-9 !min-h-[36px] !min-w-[36px] !shrink-0 !items-center !justify-center !text-[13px] !font-semibold !leading-none"
                          }
                        >
                          {`${(c.first_name[0] ?? "?").toUpperCase()}${(c.last_name[0] ?? "?").toUpperCase()}`}
                        </div>
                        <span
                          className={`absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-card)] ${callStatusAvatarRingClass(c.call_status)}`}
                          title={callStatusLabel(c.call_status)}
                          aria-hidden
                        />
                      </div>
                      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                        <p className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDotClass(c.priority)}`}
                            title={
                              c.priority === "High"
                                ? "Υψηλή"
                                : c.priority === "Low"
                                  ? "Χαμηλή"
                                  : "Μεσαία"
                            }
                          />
                          <span className="min-w-0 truncate font-semibold leading-tight text-[var(--text-table)]">
                            {c.first_name} {c.last_name}
                          </span>
                        </p>
                        {c.contact_code ? (
                          <span className="mt-1 inline-block max-w-full truncate rounded border border-[var(--border)]/70 bg-[var(--bg-elevated)]/90 px-1.5 py-0.5 font-mono text-[11px] leading-tight text-[var(--text-muted)]">
                            {c.contact_code}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </td>
                  <td
                    className={`w-[140px] max-w-[140px] overflow-hidden px-4 py-3 align-middle font-mono text-xs leading-tight text-[var(--text-secondary)] ${rowBg} group-hover/contact-row:bg-[var(--bg-elevated)]/50`}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="min-w-0 max-w-full whitespace-nowrap" title={c.phone ?? undefined}>
                        {c.phone || "—"}
                      </div>
                      {c.phone2?.trim() ? (
                        <div
                          className="min-w-0 max-w-full text-[10px] leading-tight text-[var(--text-muted)] [overflow-wrap:normal] whitespace-nowrap"
                          title={c.phone2}
                        >
                          {c.phone2}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td
                    className={`w-[120px] max-w-[120px] overflow-hidden px-4 py-3 align-middle text-xs leading-tight text-[var(--text-table)] ${rowBg} group-hover/contact-row:bg-[var(--bg-elevated)]/50`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium" title={c.municipality ?? ""}>
                        {c.municipality?.trim() || "—"}
                      </div>
                      <div className="truncate text-[10px] text-[var(--text-muted)]" title={c.area ?? ""}>
                        {c.area?.trim() || "—"}
                      </div>
                    </div>
                  </td>
                  <td
                    className={`w-[100px] max-w-[100px] overflow-hidden px-4 py-3 align-middle ${rowBg} group-hover/contact-row:bg-[var(--bg-elevated)]/50`}
                  >
                    {c.contact_groups ? (
                      <div className="min-w-0 max-w-full overflow-hidden">
                        <GroupPillWithHint g={c.contact_groups} />
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td
                    className={`w-[90px] max-w-[90px] overflow-hidden px-4 py-3 align-middle text-xs ${rowBg} group-hover/contact-row:bg-[var(--bg-elevated)]/50`}
                  >
                    {nameDay ? (
                      <span
                        className={nameDayGold ? "font-medium text-[#C9A84C]" : "text-[var(--text-secondary)]"}
                        title={nameDayGold ? "Σήμερα ή αυτή την εβδομάδα" : undefined}
                      >
                        {nameDay}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td
                    className={`w-[120px] max-w-[120px] overflow-hidden px-4 py-3 align-middle text-xs leading-tight text-[var(--text-table)] ${rowBg} group-hover/contact-row:bg-[var(--bg-elevated)]/50`}
                  >
                    {c.father_name?.trim() ? (
                      <span className="line-clamp-1 min-w-0" title={c.father_name}>
                        {c.father_name}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                  <td
                    className={`w-20 min-w-20 max-w-20 overflow-hidden px-4 py-3 text-right align-middle ${rowBg} group-hover/contact-row:bg-[var(--bg-elevated)]/50`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex w-full min-w-0 items-center justify-end gap-0.5">
                      <button
                        type="button"
                        className={lux.btnIcon + " !h-7 !w-7 !min-h-0 !min-w-0"}
                        title="Κλήση"
                        onClick={(e) => void triggerCall(e, c.id)}
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={lux.btnIcon + " !h-7 !w-7 !min-h-0 !min-w-0"}
                        title="Άνοιγμα επαφής"
                        onClick={() => router.push(`/contacts/${c.id}`)}
                      >
                        <User className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contacts.length === 0 && <p className="p-8 text-center text-sm text-[var(--text-secondary)]">Δεν βρέθηκαν επαφές</p>}
      </div>
      {contacts.length === 0 && (
        <p className="p-4 text-center text-sm text-[var(--text-secondary)] md:hidden">Δεν βρέθηκαν επαφές</p>
      )}

      {listTotal > 0 && (
        <div className="flex w-full min-w-0 max-w-full flex-col items-stretch justify-between gap-3 border-t border-[var(--border)]/60 pt-4 sm:flex-row sm:items-center">
          <p className="w-full min-w-0 text-center text-sm text-[var(--text-secondary)] sm:max-w-[50%] sm:text-left" aria-live="polite">
            Εμφάνιση {rangeFrom}–{rangeTo} από {listTotal} επαφές
          </p>
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-1 sm:justify-end">
            <button
              type="button"
              className={lux.btnSecondary + " !px-3 !py-2 text-xs sm:text-sm"}
              disabled={currentPage <= 1}
              onClick={() => patch({ page: String(currentPage - 1) })}
            >
              Προηγούμενο
            </button>
            {pageList.map((pn) => (
              <button
                key={pn}
                type="button"
                className={
                  lux.btnSecondary +
                  (pn === currentPage ? " !ring-1 !ring-[#C9A84C]" : "") +
                  " !min-w-[2.5rem] !px-2 !py-2 text-xs sm:text-sm"
                }
                onClick={() => patch({ page: String(pn) })}
                aria-current={pn === currentPage ? "page" : undefined}
              >
                {pn}
              </button>
            ))}
            <button
              type="button"
              className={lux.btnSecondary + " !px-3 !py-2 text-xs sm:text-sm"}
              disabled={currentPage >= totalPages}
              onClick={() => patch({ page: String(currentPage + 1) })}
            >
              Επόμενο
            </button>
          </div>
        </div>
      )}

      {canManage && (
        <button
          type="button"
          className="no-mobile-scale fixed bottom-24 right-4 z-30 flex h-14 w-14 min-h-14 min-w-14 items-center justify-center rounded-full border-2 border-[#8B6914] text-[#0A1628] shadow-[0_6px_24px_rgba(0,0,0,0.4)] max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:hidden"
          style={{ backgroundColor: "#C9A84C" }}
          onClick={() => setOpenCreate(true)}
          aria-label="Νέα επαφή"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}

      {selectedIds.length > 0 && (
        <div className="hq-bulk-bar fixed inset-x-0 bottom-0 z-50 max-w-[100vw] overflow-x-hidden max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] border-t border-[var(--border)] bg-[var(--surface-bulk)] p-2 shadow-[var(--card-shadow)] backdrop-blur-md sm:p-3 md:bottom-4 md:left-1/2 md:right-auto md:w-[min(96%,56rem)] md:max-w-[calc(100vw-1rem)] md:-translate-x-1/2 md:rounded-2xl md:border md:px-3">
          {bulkErr && <p className="mb-2 break-words text-center text-xs text-[var(--status-negative-text)]">{bulkErr}</p>}
          <div className="flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:justify-between">
            <p className="w-full min-w-0 shrink-0 text-center text-sm font-medium text-[var(--text-primary)] sm:w-auto sm:max-w-[12rem] sm:text-left">
              {selectedIds.length} επαφές επιλεγμένες
            </p>
            <div className="flex w-full min-w-0 max-w-full flex-1 flex-col items-stretch gap-2 [min-width:0] sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
              {canManage && (
                <>
                  <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center">
                    <label className="sr-only" htmlFor="bulk-status">Αλλαγή status</label>
                    <select
                      id="bulk-status"
                      className={lux.select + " !h-9 w-full sm:min-w-[11rem]"}
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                    >
                      <option value="Pending">Αναμονή</option>
                      <option value="Positive">Θετικός</option>
                      <option value="Negative">Αρνητικός</option>
                      <option value="No Answer">Δεν απάντησε</option>
                    </select>
                    <button
                      type="button"
                      className={lux.btnPrimary + " w-full !py-2 text-xs sm:w-auto sm:!px-3"}
                      onClick={() => void postBulk("update_status", bulkStatus)}
                      disabled={saving}
                    >
                      Αλλαγή status
                    </button>
                  </div>
                  <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center">
                    <label className="sr-only" htmlFor="bulk-camp">Καμπάνια</label>
                    <select
                      id="bulk-camp"
                      className={lux.select + " !h-9 w-full sm:min-w-[12rem]"}
                      value={bulkCampaign}
                      onChange={(e) => setBulkCampaign(e.target.value)}
                    >
                      <option value="">Ανάθεση σε καμπάνια</option>
                      {campaigns.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={lux.btnSecondary + " w-full !py-2 text-xs sm:w-auto sm:!px-3"}
                      onClick={() => (bulkCampaign ? void postBulk("add_to_campaign", bulkCampaign) : null)}
                      disabled={saving || !bulkCampaign}
                    >
                      Προσθήκη
                    </button>
                  </div>
                  <div className="flex w-full max-w-full flex-col gap-1 sm:w-full sm:min-w-0 sm:flex-1 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label className="mb-0.5 block text-[10px] font-medium uppercase text-[var(--text-muted)}" htmlFor="bulk-wa">
                        Αποστολή WhatsApp
                      </label>
                      <input
                        id="bulk-wa"
                        className={lux.select + " !h-9 w-full !text-sm"}
                        value={bulkWaMessage}
                        onChange={(e) => setBulkWaMessage(e.target.value)}
                        placeholder="Κείμενο (1 δευτερόλεπτο ανά επαφή)…"
                      />
                    </div>
                    <button
                      type="button"
                      className={lux.btnSecondary + " w-full !py-2 text-xs sm:w-auto sm:!shrink-0 sm:!px-3"}
                      disabled={saving || !bulkWaMessage.trim()}
                      onClick={() => void postBulk("send_whatsapp", bulkWaMessage)}
                    >
                      Αποστολή WA
                    </button>
                  </div>
                </>
              )}
              <a
                className={lux.btnSecondary + " inline-flex w-full !items-center !justify-center gap-2 !py-2.5 sm:w-auto sm:!px-3"}
                href={selectedIds.length ? `/api/contacts/export?${new URLSearchParams({ ids: selectedIds.join(",") }).toString()}` : "#"}
                onClick={(e) => {
                  if (!selectedIds.length) e.preventDefault();
                }}
              >
                <Download className="h-4 w-4" />
                Εξαγωγή
              </a>
              {isAdmin && canManage && (
                <button
                  type="button"
                  className={lux.btnDanger + " w-full !py-2.5 sm:w-auto sm:!px-3"}
                  disabled={saving}
                  onClick={() => setDeleteOpen(true)}
                >
                  Διαγραφή
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteOpen && isAdmin && (
        <div className={lux.modalOverlay}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:mx-0 sm:self-center">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Μαζική διαγραφή</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Να διαγραφούν οριστικά {selectedIds.length} επαφές; Αυτό δεν ανακαλείται.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={lux.btnSecondary} onClick={() => setDeleteOpen(false)} disabled={saving}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnDanger}
                disabled={saving}
                onClick={() => void postBulk("delete", "")}
              >
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}

      {openCreate && <CreateContactModal groups={groups} onClose={() => setOpenCreate(false)} onSaved={load} />}
    </div>
  );
}

function CreateContactModal({
  groups,
  onClose,
  onSaved,
}: {
  groups: ContactGroupRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    father_name: "",
    mother_name: "",
    phone: "",
    phone2: "",
    landline: "",
    email: "",
    area: "",
    age: "",
    gender: "",
    occupation: "",
    source: "",
    political_stance: "",
    municipality: "",
    electoral_district: "",
    toponym: "",
    spouse_name: "",
    nickname: "",
    name_day: "",
    birthday: "",
    priority: "Medium",
    influence: false,
    notes: "",
    tags: "",
    group_id: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<{
    phoneMatch: { id: string; name: string } | null;
    nameMatch: { id: string; name: string } | null;
  } | null>(null);

  const buildPayload = () => ({
    ...form,
    phone: form.phone.trim() || null,
    phone2: form.phone2.trim() || null,
    landline: form.landline.trim() || null,
    age: form.age ? Number(form.age) : null,
    tags: form.tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    municipality: form.municipality || null,
    electoral_district: form.electoral_district || null,
    toponym: form.toponym || null,
    father_name: form.father_name.trim() || null,
    mother_name: form.mother_name.trim() || null,
    spouse_name: form.spouse_name || null,
    nickname: form.nickname || null,
    name_day: form.name_day || null,
    birthday: form.birthday || null,
    call_status: "Pending",
    group_id: form.group_id || null,
  });

  const postCreate = async () => {
    const res = await fetchWithTimeout("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? "Σφάλμα αποθήκευσης");
    }
    setConflict(null);
    await onSaved();
    onClose();
  };

  const save = async () => {
    setFieldErrors({});
    const err: Record<string, string> = {};
    if (!form.first_name.trim()) err.first_name = "Υποχρεωτικό";
    if (!form.last_name.trim()) err.last_name = "Υποχρεωτικό";
    if (!form.phone.trim()) err.phone = "Υποχρεωτικό";
    if (!form.municipality.trim()) err.municipality = "Υποχρεωτικό";
    if (Object.keys(err).length) {
      setFieldErrors(err);
      return;
    }
    const qs = new URLSearchParams({
      phone: form.phone.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
    });
    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/precheck?${qs.toString()}`);
      const j = (await res.json()) as {
        phoneMatch: { id: string; name: string } | null;
        nameMatch: { id: string; name: string } | null;
      };
      if (j.phoneMatch || j.nameMatch) {
        setConflict({ phoneMatch: j.phoneMatch, nameMatch: j.nameMatch });
        return;
      }
      await postCreate();
    } finally {
      setSubmitting(false);
    }
  };

  const onContinueAfterConflict = async () => {
    setSubmitting(true);
    setConflict(null);
    try {
      await postCreate();
    } finally {
      setSubmitting(false);
    }
  };

  const openExistingId = conflict
    ? conflict.phoneMatch?.id ?? conflict.nameMatch?.id
    : null;

  return (
    <>
    <div className={lux.modalOverlay}>
      <div className={lux.modalPanel + " flex max-h-[100dvh] max-w-full flex-col sm:max-h-[90vh] sm:max-w-[680px]"}>
        <div className="mx-auto mt-2 h-1 w-11 shrink-0 rounded-full bg-[var(--border)] md:hidden" role="presentation" />
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h3 className="text-xl font-bold text-[var(--text-primary)]">Νέα Επαφή</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            aria-label="Κλείσιμο"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Μικρό Όνομα"
              required
              error={fieldErrors.first_name}
              value={form.first_name}
              placeholder="Εισάγετε μικρό όνομα"
              onChange={(v) => setForm({ ...form, first_name: v })}
            />
            <FormField
              label="Επίθετο"
              required
              error={fieldErrors.last_name}
              value={form.last_name}
              placeholder="Εισάγετε επίθετο"
              onChange={(v) => setForm({ ...form, last_name: v })}
            />
            <FormField
              label="Πατρώνυμο"
              value={form.father_name}
              placeholder="Όνομα πατέρα"
              onChange={(v) => setForm({ ...form, father_name: v })}
            />
            <FormField
              label="Μητρώνυμο"
              value={form.mother_name}
              placeholder="Όνομα μητέρας"
              onChange={(v) => setForm({ ...form, mother_name: v })}
            />
            <FormField
              label="Κινητό 1"
              required
              error={fieldErrors.phone}
              value={form.phone}
              placeholder="π.χ. 6912345678"
              onChange={(v) => setForm({ ...form, phone: v })}
            />
            <FormField
              label="Κινητό 2"
              value={form.phone2}
              placeholder="Προαιρετικό"
              onChange={(v) => setForm({ ...form, phone2: v })}
            />
            <FormField
              label="Σταθερό"
              value={form.landline}
              placeholder="π.χ. 2101234567"
              onChange={(v) => setForm({ ...form, landline: v })}
            />
            <div className="md:col-span-2">
              <AitoloakarnaniaLocationFields
                values={{
                  municipality: form.municipality,
                  electoral_district: form.electoral_district,
                  toponym: form.toponym,
                }}
                errorMunicipality={fieldErrors.municipality}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    municipality: v.municipality ?? "",
                    electoral_district: v.electoral_district ?? "",
                    toponym: v.toponym ?? "",
                  }))
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className={lux.label} htmlFor="new-contact-group">
                Ομάδα
              </label>
              <select
                id="new-contact-group"
                className={lux.select}
                value={form.group_id}
                onChange={(e) => setForm({ ...form, group_id: e.target.value })}
              >
                <option value="">— Χωρίς ομάδα —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.year != null ? ` (${g.year})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <FormField label="Email" value={form.email} placeholder="email@example.com" onChange={(v) => setForm({ ...form, email: v })} />
            <FormField label="Περιοχή" value={form.area} placeholder="Περιοχή / περιφέρεια" onChange={(v) => setForm({ ...form, area: v })} />
            <FormField
              label="Υποκοριστικό"
              value={form.nickname}
              placeholder="Προαιρετικό"
              onChange={(v) => setForm({ ...form, nickname: v })}
            />
            <FormField label="Όνομα συζύγου" value={form.spouse_name} onChange={(v) => setForm({ ...form, spouse_name: v })} />
            <FormField label="Γιορτή" type="date" value={form.name_day} onChange={(v) => setForm({ ...form, name_day: v })} />
            <FormField label="Γενέθλια" type="date" value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} />
            <FormField label="Ηλικία" value={form.age} placeholder="Έτη" onChange={(v) => setForm({ ...form, age: v })} />
            <SelectFormField
              label="Φύλο"
              value={form.gender}
              onChange={(v) => setForm({ ...form, gender: v })}
              options={["Άνδρας", "Γυναίκα", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <FormField label="Επάγγελμα" value={form.occupation} onChange={(v) => setForm({ ...form, occupation: v })} />
            <SelectFormField
              label="Πηγή επαφής"
              value={form.source}
              onChange={(v) => setForm({ ...form, source: v })}
              options={["Εκδήλωση", "Παλιός ψηφοφόρος", "Φίλος", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <SelectFormField
              label="Πολιτική τοποθέτηση"
              value={form.political_stance}
              onChange={(v) => setForm({ ...form, political_stance: v })}
              options={["Κεντροδεξιός", "Αριστερός", "Ακροδεξιός", "Αναποφάσιστος", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <SelectFormField
              label="Προτεραιότητα"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
              options={["High", "Medium", "Low"]}
              valueLabels={{ High: "Υψηλή", Medium: "Μεσαία", Low: "Χαμηλή" }}
            />
            <div>
              <label className={lux.label}>Επιρροή</label>
              <div className="relative">
                <select
                  className={lux.select}
                  value={form.influence ? "Ναι" : "Όχι"}
                  onChange={(e) => setForm({ ...form, influence: e.target.value === "Ναι" })}
                >
                  <option>Όχι</option>
                  <option>Ναι</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={lux.label}>Ετικέτες (διαχωρισμός με κόμμα)</label>
              <input
                className={lux.input}
                placeholder="π.χ. τοπική, πεδίο"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={lux.label}>Σημειώσεις</label>
              <textarea
                className={lux.textarea}
                placeholder="Καταγράψτε σημαντικές πληροφορίες..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg-elevated)]/50 px-6 py-4">
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={submitting}>
            Ακύρωση
          </button>
          <button type="button" onClick={() => void save()} className={lux.btnPrimary} disabled={submitting}>
            {submitting ? "Αποθήκευση…" : "Αποθήκευση"}
          </button>
        </div>
      </div>
    </div>

    {conflict && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-[8px] [background:var(--overlay-scrim)]">
        <div className="hq-modal-panel w-full max-w-md space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
          <h4 className="text-lg font-bold text-[var(--text-primary)]">Πιθανή σύγκρουση</h4>
          {conflict.phoneMatch && (
            <p className="text-sm text-[var(--text-primary)]">
              Αυτός ο αριθμός φαίνεται να ανήκει ήδη στον{" "}
              <span className="font-semibold">{conflict.phoneMatch.name}</span>. Διαφορετικό άτομο ή διπλότυπο;
            </p>
          )}
          {conflict.nameMatch && (
            <p className="text-sm text-[var(--text-primary)]">
              Υπάρχει ήδη επαφή με ίδιο όνομα/επίθετο:{" "}
              <span className="font-semibold">{conflict.nameMatch.name}</span>
            </p>
          )}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" onClick={() => setConflict(null)} className={lux.btnSecondary + " w-full sm:w-auto"}>
              Ακύρωση
            </button>
            {openExistingId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/contacts/${openExistingId}`);
                }}
                className={lux.btnGold + " w-full sm:w-auto"}
              >
                Άνοιγμα υπάρχουσας επαφής
              </button>
            )}
            <button
              type="button"
              onClick={() => void onContinueAfterConflict()}
              className={lux.btnPrimary + " w-full sm:w-auto"}
              disabled={submitting}
            >
              Διαφορετικό άτομο — συνέχεια
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default function ContactsPageWithSuspense() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--text-muted)]">Φόρτωση…</div>
      }
    >
      <CrmErrorBoundary title="Δεν φορτώθηκε η λίστα επαφών.">
        <ContactsPage />
      </CrmErrorBoundary>
    </Suspense>
  );
}

function FormField({
  label,
  value,
  onChange,
  required,
  type,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={lux.label}>
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
      </label>
      <input
        className={[lux.input, error ? lux.inputError : ""].join(" ")}
        value={value}
        type={type ?? "text"}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

function SelectFormField({
  label,
  value,
  onChange,
  options,
  valueLabels,
  allowEmpty,
  emptyLabel = "—",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  valueLabels?: Record<string, string>;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <label className={lux.label}>{label}</label>
      <div className="relative">
        <select className={lux.select} value={value} onChange={(e) => onChange(e.target.value)}>
          {allowEmpty && (
            <option value="">
              {emptyLabel}
            </option>
          )}
          {options.map((o) => (
            <option key={o} value={o}>
              {valueLabels?.[o] ?? o}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      </div>
    </div>
  );
}

