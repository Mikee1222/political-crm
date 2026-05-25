"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  FileText,
  Inbox,
  Pencil,
  Search,
  Stethoscope,
  Wrench,
  HelpCircle,
} from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import {
  isClosedRequestStatus,
  isFailedRequestStatus,
  isSuccessfulRequestStatus,
  normalizeRequestStatus,
  REQUEST_STATUSES,
  REQUEST_STATUS_BADGE_CLASSES,
  REQUEST_STATUS_COMPLETED_SUCCESS,
  REQUEST_STATUS_OPEN,
} from "@/lib/request-statuses";
import { lux, priorityPill } from "@/lib/luxury-styles";
import { NewRequestModal } from "@/components/requests/new-request-modal";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFormToast } from "@/contexts/form-toast-context";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { PortalDropdownPanel, usePortalDropdown } from "@/components/ui/portal-dropdown";

type RequestRow = {
  id: string;
  request_code: string | null;
  contact_id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  created_at: string | null;
  sla_due_date?: string | null;
  sla_status?: string | null;
  slaUi?: "on_track" | "at_risk" | "overdue" | null;
  contacts: { first_name: string; last_name: string; phone?: string | null } | null;
};

type Assignee = { id: string; full_name: string | null; role: string };

type RequestFilters = {
  status: string;
  category: string;
  priority: string;
  range: string;
  assigned: string;
  search: string;
  page: string;
};

const DEFAULT_FILTERS: RequestFilters = {
  status: "",
  category: "",
  priority: "",
  range: "",
  assigned: "",
  search: "",
  page: "1",
};

function filtersFromSearchParams(sp: URLSearchParams): RequestFilters {
  return {
    status: sp.get("status") ? normalizeRequestStatus(sp.get("status")) : "",
    category: sp.get("category") ?? "",
    priority: sp.get("priority") ?? "",
    range: sp.get("range") ?? "",
    assigned: sp.get("assigned") ?? "",
    search: sp.get("q") ?? sp.get("search") ?? "",
    page: sp.get("page") ?? "1",
  };
}

function filtersToSearchParams(f: RequestFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.category) p.set("category", f.category);
  if (f.priority) p.set("priority", f.priority);
  if (f.range) p.set("range", f.range);
  if (f.assigned) p.set("assigned", f.assigned);
  if (f.search.trim()) p.set("q", f.search.trim());
  if (f.page && f.page !== "1") p.set("page", f.page);
  return p;
}

function RequestsMobileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="hq-skeleton-shimmer h-52 rounded-[20px] border border-[var(--border)]/40 shadow-[var(--card-shadow)]"
        />
      ))}
    </div>
  );
}

export default function RequestsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const canQuickComplete = hasMinRole(profile?.role, "manager");

  const [f, setF] = useState<RequestFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listTotal, setListTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState<Array<{ status: string; count: number }>>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [searchQ, setSearchQ] = useState(
    () => searchParams.get("q") ?? searchParams.get("search") ?? "",
  );
  const filtersUrlKeyRef = useRef<string | null>(null);
  const pageSize = 50;

  const searchKey = useMemo(() => searchParams.toString(), [searchParams]);

  useLayoutEffect(() => {
    if (filtersUrlKeyRef.current === searchKey) return;
    filtersUrlKeyRef.current = searchKey;
    const next = filtersFromSearchParams(new URLSearchParams(searchKey));
    setF(next);
    setSearchQ(next.search);
  }, [searchKey]);

  const patch = useCallback(
    (p: Partial<RequestFilters>, opts?: { resetPage?: boolean }) => {
      setF((prev) => {
        const next = { ...prev, ...p };
        if (opts?.resetPage !== false) {
          next.page = "1";
        }
        const q = filtersToSearchParams(next).toString();
        startTransition(() => {
          router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
        });
        return next;
      });
    },
    [router, pathname],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchQ === f.search) return;
      patch({ search: searchQ });
    }, 400);
    return () => window.clearTimeout(t);
  }, [searchQ, f.search, patch]);

  const currentPage = Math.max(1, parseInt(f.page || "1", 10) || 1);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (f.status) q.set("status", f.status);
    if (f.category) q.set("category", f.category);
    if (f.priority) q.set("priority", f.priority);
    if (f.range) q.set("range", f.range);
    if (f.assigned) q.set("assigned", f.assigned);
    if (f.search.trim()) q.set("q", f.search.trim());
    q.set("page", String(currentPage));
    q.set("page_size", String(pageSize));

    setListLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/requests?${q.toString()}`);
      const data = (await res.json()) as {
        data?: RequestRow[];
        requests?: RequestRow[];
        count?: number;
        total_pages?: number;
        statusCounts?: Array<{ status: string; count: number }>;
        totalCount?: number;
      };
      const list = data.data ?? data.requests ?? [];
      setRows(list);
      setListTotal(typeof data.count === "number" ? data.count : list.length);
      setTotalPages(Math.max(1, data.total_pages ?? 1));
      setStatusCounts(Array.isArray(data.statusCounts) ? data.statusCounts : []);
      setTotalCount(typeof data.totalCount === "number" ? data.totalCount : 0);
    } finally {
      setListLoading(false);
    }
  }, [f.status, f.category, f.priority, f.range, f.assigned, f.search, currentPage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const [catRes, teamRes] = await Promise.all([
        fetchWithTimeout("/api/request-categories"),
        fetchWithTimeout("/api/team/assignees"),
      ]);
      if (catRes.ok) {
        const j = (await catRes.json()) as { categories?: string[] };
        setCategoryOptions(j.categories ?? []);
      }
      if (teamRes.ok) {
        const j = (await teamRes.json()) as { assignees?: Assignee[] };
        setAssignees(
          (j.assignees ?? []).filter((a) => a.full_name && hasMinRole(a.role, "caller")),
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreateOpen(true);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("new");
    const q = p.toString();
    startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }, [searchParams, router, pathname]);

  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(totalPages, page));
    patch({ page: String(p) }, { resetPage: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleQuickComplete = useCallback(
    async (id: string) => {
      const res = await fetchWithTimeout(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: REQUEST_STATUS_COMPLETED_SUCCESS }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Σφάλμα");
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: REQUEST_STATUS_COMPLETED_SUCCESS,
                slaUi: "on_track",
              }
            : r,
        ),
      );
      setStatusCounts((prev) =>
        prev.map((row) => {
          if (row.status === REQUEST_STATUS_COMPLETED_SUCCESS) {
            return { ...row, count: row.count + 1 };
          }
          if (row.status === REQUEST_STATUS_OPEN) {
            return { ...row, count: Math.max(0, row.count - 1) };
          }
          return row;
        }),
      );
    },
    [],
  );

  const rangeFrom = listTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeTo = Math.min(currentPage * pageSize, listTotal);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Αιτήματα"
        subtitle="Φιλτράρισμα και διαχείριση αιτημάτων πολιτών — κάρτες με SLA και κατάσταση."
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className={lux.btnGold + " hq-shimmer-gold !rounded-full !px-5 !py-2.5 !text-sm"}
          >
            <Inbox className="h-4 w-4" />
            Νέο αίτημα
          </button>
        }
      />

      {statusCounts.length > 0 ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {statusCounts.map(({ status, count }) => {
            const active = f.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => patch({ status })}
                className={[
                  "flex shrink-0 flex-col items-center rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)] shadow-sm"
                    : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[color-mix(in_srgb,var(--accent-gold)_45%,var(--border))]",
                ].join(" ")}
              >
                <span className="text-lg font-bold tabular-nums">{count.toLocaleString("el-GR")}</span>
                <span
                  className={
                    active ? "text-xs opacity-90" : "text-xs text-[var(--text-muted)]"
                  }
                >
                  {status}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => patch({ status: "" })}
            className={[
              "flex shrink-0 flex-col items-center rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
              !f.status
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)] shadow-sm"
                : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[color-mix(in_srgb,var(--accent-gold)_45%,var(--border))]",
            ].join(" ")}
          >
            <span className="text-lg font-bold tabular-nums">{totalCount.toLocaleString("el-GR")}</span>
            <span className={!f.status ? "text-xs opacity-90" : "text-xs text-[var(--text-muted)]"}>
              Σύνολο
            </span>
          </button>
        </div>
      ) : null}

      <div className={lux.card + " !p-4 sm:!p-5"}>
        <div className="mb-4">
          <label className={lux.label} htmlFor="r-search">
            Αναζήτηση
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <input
              id="r-search"
              type="text"
              placeholder="Αναζήτηση τίτλου, ονόματος ή τηλεφώνου..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className={
                lux.input +
                " hq-input-elevated w-full !py-2.5 !pl-9 !pr-4 text-sm focus:!ring-2 focus:!ring-[var(--accent-gold)]/40"
              }
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={lux.label} htmlFor="r-st">
              Κατάσταση
            </label>
            <SearchableSelect
              id="r-st"
              className="hq-input-elevated"
              value={f.status}
              onChange={(v) => patch({ status: v })}
              placeholder="Όλες οι καταστάσεις"
              options={REQUEST_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="r-cat">
              Κατηγορία
            </label>
            <SearchableSelect
              id="r-cat"
              className="hq-input-elevated"
              value={f.category}
              onChange={(v) => patch({ category: v })}
              placeholder="Όλες οι κατηγορίες"
              options={categoryOptions.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="r-priority">
              Προτεραιότητα
            </label>
            <HqSelect
              id="r-priority"
              className="hq-input-elevated"
              value={f.priority}
              onChange={(e) => patch({ priority: e.target.value })}
            >
              <option value="">Όλες</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </HqSelect>
          </div>
          <div>
            <label className={lux.label} htmlFor="r-range">
              Χρονικό διάστημα
            </label>
            <HqSelect
              id="r-range"
              className="hq-input-elevated"
              value={f.range}
              onChange={(e) => patch({ range: e.target.value })}
            >
              <option value="">Όλα</option>
              <option value="today">Σήμερα</option>
              <option value="7d">Τελευταίες 7 μέρες</option>
              <option value="30d">Τελευταίες 30 μέρες</option>
              <option value="90d">Τελευταίες 90 μέρες</option>
            </HqSelect>
          </div>
          <div>
            <label className={lux.label} htmlFor="r-assigned">
              Ανάθεση
            </label>
            <SearchableSelect
              id="r-assigned"
              className="hq-input-elevated"
              value={f.assigned}
              onChange={(v) => patch({ assigned: v })}
              placeholder="Όλα"
              options={assignees
                .filter((a) => a.full_name)
                .map((a) => ({ value: a.full_name!, label: a.full_name! }))}
            />
          </div>
        </div>
      </div>

      {listLoading ? (
        <RequestsMobileSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          className="max-lg:border-[var(--border)] max-lg:bg-[var(--bg-card)]/80 max-lg:py-12"
          title="Δεν υπάρχουν αιτήματα ακόμα"
          subtitle="Δημιουργήστε το πρώτο αίτημα για να εμφανιστεί εδώ με κωδικό, SLA και επαφή."
          action={
            <button type="button" onClick={() => setCreateOpen(true)} className={lux.btnPrimary}>
              Νέο αίτημα
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="hq-stagger-item"
              style={{ ["--stagger" as string]: String(i) }}
            >
              <RequestCard
                r={r}
                canQuickComplete={canQuickComplete}
                onOpen={() => router.push(`/requests/${r.id}`)}
                onEdit={() => setSelected(r)}
                onQuickComplete={handleQuickComplete}
              />
            </div>
          ))}
        </div>
      )}

      {!listLoading && rows.length > 0 && totalPages > 1 ? (
        <div className="mb-24 flex flex-col items-center justify-between gap-3 border-t border-[var(--border)] pt-4 sm:flex-row">
          <p className="text-xs text-[var(--text-muted)]">
            {rangeFrom}–{rangeTo} από {listTotal}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className={lux.btnSecondary + " !py-2 text-xs"}
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              Προηγούμενη
            </button>
            <span className="px-2 text-sm font-medium text-[var(--text-secondary)]">
              Σελίδα {currentPage} από {totalPages}
            </span>
            <button
              type="button"
              className={lux.btnSecondary + " !py-2 text-xs"}
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              Επόμενη
            </button>
          </div>
        </div>
      ) : null}

      <NewRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      {selected && (
        <EditRequestModal request={selected} onClose={() => setSelected(null)} onSaved={load} />
      )}
    </div>
  );
}

function categoryStyle(cat: string | null | undefined): {
  left: string;
  Icon: LucideIcon;
  iconClass: string;
} {
  const c = (cat || "").toLowerCase();
  if (c.includes("υγεία"))
    return { left: "border-l-4 border-l-emerald-500", Icon: Stethoscope, iconClass: "text-emerald-400" };
  if (c.includes("εκπαίδευ"))
    return { left: "border-l-4 border-l-sky-500", Icon: FileText, iconClass: "text-sky-400" };
  if (c.includes("δημόσια") || c.includes("υπηρεσ"))
    return { left: "border-l-4 border-l-blue-600", Icon: Wrench, iconClass: "text-blue-300" };
  if (c.includes("άλλο"))
    return { left: "border-l-4 border-l-slate-500", Icon: HelpCircle, iconClass: "text-slate-400" };
  return {
    left: "border-l-4 border-l-[var(--accent-gold)]",
    Icon: Inbox,
    iconClass: "text-[var(--accent-gold)]",
  };
}

function contactInitials(c: { first_name: string; last_name: string } | null) {
  if (!c) return "?";
  const a = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.trim();
  return a.toUpperCase() || "?";
}

function daysLeftSla(due: string | null | undefined, status: string) {
  if (isClosedRequestStatus(status)) return null;
  if (!due) return null;
  const d = new Date(due + "T12:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function SlaDonut({ daysLeft, max = 14 }: { daysLeft: number | null; max?: number }) {
  if (daysLeft == null) {
    return <span className="text-xs text-[var(--text-muted)]">SLA</span>;
  }
  const r = 16;
  const c = 2 * Math.PI * r;
  const ratio = daysLeft < 0 ? 0 : Math.min(1, daysLeft / max);
  const dash = ratio * c;
  const stroke = daysLeft < 0 ? "#ef4444" : daysLeft <= 3 ? "#f59e0b" : "#10b981";
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center"
      title={daysLeft < 0 ? "Ληξιπρόθεσμο" : `Ημέρες: ${daysLeft}`}
    >
      <svg width="48" height="48" className="-rotate-90" viewBox="0 0 48 48" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[9px] font-bold tabular-nums text-[var(--text-primary)]">
        {daysLeft < 0 ? "!" : daysLeft}
      </span>
    </div>
  );
}

function RequestCard({
  r,
  canQuickComplete,
  onOpen,
  onEdit,
  onQuickComplete,
}: {
  r: RequestRow;
  canQuickComplete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onQuickComplete: (id: string) => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const st = categoryStyle(r.category);
  const Icon = st.Icon;
  const status = normalizeRequestStatus(r.status ?? REQUEST_STATUS_OPEN);
  const days = daysLeftSla(r.sla_due_date, status);
  const isCompleted = isSuccessfulRequestStatus(status);
  const isRejected = isFailedRequestStatus(status);
  const showQuickTick = canQuickComplete && !isCompleted && !isRejected;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const confirmMenu = usePortalDropdown({
    open: confirmOpen,
    setOpen: setConfirmOpen,
    align: "right",
    minWidth: 224,
  });

  const confirmComplete = async () => {
    setCompleting(true);
    try {
      await onQuickComplete(r.id);
      setConfirmOpen(false);
      showToast("Το αίτημα ολοκληρώθηκε.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Σφάλμα", "error");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <article
      className={`hq-table-row-interactive group relative flex min-h-[180px] cursor-pointer flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm transition duration-200 hover:shadow-md ${st.left}`}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 pr-24">
          <Icon className={`h-5 w-5 shrink-0 ${st.iconClass}`} aria-hidden />
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{r.request_code ?? "—"}</span>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {isCompleted ? (
            <CheckCircle2
              className="h-7 w-7 shrink-0 fill-green-500 text-white shadow-[0_0_8px_2px_rgba(34,197,94,0.3)] sm:shadow-none"
              aria-label={REQUEST_STATUS_COMPLETED_SUCCESS}
            />
          ) : showQuickTick ? (
            <div className="relative">
              <button
                ref={(el) => {
                  confirmMenu.triggerRef.current = el;
                }}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmMenu.toggle();
                }}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full shadow-[0_0_8px_2px_rgba(34,197,94,0.3)] transition-transform hover:bg-green-500/10 active:scale-95 sm:shadow-none"
                aria-label={REQUEST_STATUS_COMPLETED_SUCCESS}
              >
                <CheckCircle2 className="h-7 w-7 text-green-500 hover:text-green-400" />
              </button>
              <PortalDropdownPanel
                open={confirmOpen}
                pos={confirmMenu.pos}
                panelRef={confirmMenu.panelRef}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-lg"
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs text-[var(--text-primary)]">
                    Να επισημανθεί ως {REQUEST_STATUS_COMPLETED_SUCCESS};
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className={lux.btnPrimary + " !py-1 !text-xs flex-1"}
                      disabled={completing}
                      onClick={() => void confirmComplete()}
                    >
                      Ναι
                    </button>
                    <button
                      type="button"
                      className={lux.btnSecondary + " !py-1 !text-xs flex-1"}
                      disabled={completing}
                      onClick={() => setConfirmOpen(false)}
                    >
                      Άκυρο
                    </button>
                  </div>
                </div>
              </PortalDropdownPanel>
            </div>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className={lux.btnIcon}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
      <h2 className="line-clamp-2 flex-1 text-base font-bold leading-snug text-[var(--text-primary)]">{r.title}</h2>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-xs font-bold text-white shadow-sm">
            {contactInitials(r.contacts)}
          </div>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {r.contacts ? `${r.contacts.first_name} ${r.contacts.last_name}` : "—"}
          </p>
        </div>
        <SlaDonut daysLeft={days} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border)]/60 pt-2">
        <StatusBadge status={status} withDot />
        <PriorityPill p={r.priority} />
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">
          {r.created_at ? new Date(r.created_at).toLocaleDateString("el-GR") : ""}
        </span>
      </div>
    </article>
  );
}

function PriorityPill({ p }: { p: string | null | undefined }) {
  const k =
    p === "High" || p === "Low" || p === "Medium" || p === "Urgent" ? p : "Medium";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        priorityPill[k] ?? priorityPill.Medium
      }`}
    >
      {k}
    </span>
  );
}

function StatusBadge({ status, withDot }: { status: string; withDot?: boolean }) {
  const styles = REQUEST_STATUS_BADGE_CLASSES;
  const s = normalizeRequestStatus(status || REQUEST_STATUS_OPEN);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[s as keyof typeof styles] ?? styles[REQUEST_STATUS_OPEN]
      } transition-colors duration-200`}
    >
      {withDot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80 [animation:hq-pulse-dot_2.4s_ease-in-out_infinite]"
          aria-hidden
        />
      )}
      {s}
    </span>
  );
}

function EditRequestModal({
  request,
  onClose,
  onSaved,
}: {
  request: RequestRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useFormToast();
  const [categories, setCategories] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: request.title,
    description: request.description ?? "",
    category: request.category ?? "Άλλο",
    status: normalizeRequestStatus(request.status ?? REQUEST_STATUS_OPEN),
    priority: (request.priority === "High" ||
    request.priority === "Low" ||
    request.priority === "Urgent"
      ? request.priority
      : "Medium") as "High" | "Medium" | "Low" | "Urgent",
    assigned_to: request.assigned_to ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithTimeout("/api/request-categories");
      if (res.ok) {
        const j = (await res.json()) as { categories?: string[] };
        setCategories(j.categories ?? []);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/requests/${request.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα αποθήκευσης", "error");
        return;
      }
      showToast("Το αίτημα ενημερώθηκε.", "success");
      await onSaved();
      onClose();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/requests/${request.id}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Αποτυχία διαγραφής", "error");
        return;
      }
      showToast("Το αίτημα διαγράφηκε.", "success");
      await onSaved();
      onClose();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CenteredModal
      open
      onClose={onClose}
      title="Επεξεργασία αιτήματος"
      ariaLabel="Επεξεργασία αιτήματος"
      sheetOnMobile
      className="!max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={saving}>
            Άκυρο
          </button>
          <FormSubmitButton type="button" loading={saving} variant="gold" onClick={() => void save()}>
            Αποθήκευση
          </FormSubmitButton>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 font-mono text-sm font-bold tracking-tight text-[var(--text-card-title)]">
          {request.request_code ?? "—"}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">{request.title}</p>
      <div className="mt-4 grid max-w-[640px] gap-4">
        <div>
          <label className={lux.label}>Τίτλος</label>
          <input
            className={lux.input}
            value={form.title}
            placeholder="Τίτλος αιτήματος"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <label className={lux.label}>Περιγραφή</label>
          <textarea
            className={lux.textarea}
            value={form.description}
            placeholder="Περιγραφή…"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label className={lux.label}>Κατηγορία</label>
          <HqSelect value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.length === 0
              ? ["Άλλο", "Υγεία", "Εκπαίδευση", "Υποδομές", "Δημόσια υπηρεσία"].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))
              : categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
          </HqSelect>
        </div>
        <div>
          <label className={lux.label}>Κατάσταση</label>
          <HqSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {REQUEST_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </HqSelect>
        </div>
        <div>
          <label className={lux.label}>Priority</label>
          <HqSelect
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value as "High" | "Medium" | "Low" | "Urgent" })
            }
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="Urgent">Urgent</option>
          </HqSelect>
        </div>
        <div>
          <label className={lux.label}>Ανάθεση</label>
          <input
            className={lux.input}
            value={form.assigned_to}
            placeholder="Όνομα υπευθύνου"
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => void remove()}
          className="text-sm font-medium text-[#DC2626] hover:underline"
          disabled={saving}
        >
          Διαγραφή αιτήματος
        </button>
      </div>
    </CenteredModal>
  );
}
