"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { lux, priorityPill } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { computeSlaStatus } from "@/lib/request-sla";
import { formatCalendarDateOnly, formatDateTimeEnGb } from "@/lib/date-format";
import { useProfile } from "@/contexts/profile-context";
import { useResolveAuthorName } from "@/contexts/staff-aliases-context";
import { useContactTabs } from "@/contexts/contact-tabs-context";
import { can } from "@/lib/can";
import { hasMinRole } from "@/lib/roles";
import { useFormToast } from "@/contexts/form-toast-context";
import { RequestDocumentsSection } from "@/components/request-documents-section";
import { RequestPersonsSections } from "@/components/requests/request-persons-sections";
import {
  normalizeRequestStatus,
  OPEN_REQUEST_STATUSES,
  REQUEST_STATUSES,
  REQUEST_STATUS_OPEN,
} from "@/lib/request-statuses";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { AISummaryCard } from "@/components/ai-summary-card";
import { CrmErrorBoundary } from "@/components/crm-error-boundary";
import { useOptionalAlexandraPageContext } from "@/contexts/alexandra-page-context";
import {
  formatAssigneeOptionLabel,
  useRequestFilterOptions,
} from "@/hooks/use-request-filter-options";
import {
  ENTITY_SEARCH_NAV_EVENT,
  isRequestsSearchNavActive,
  loadRequestsSearchNav,
  REQUESTS_SEARCH_NAV_KEY,
} from "@/lib/search-session-state";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CenteredModal } from "@/components/ui/centered-modal";

const DESCRIPTION_MAX_LEN = 2000;

const PRIORITY_OPTIONS: { value: InlineEditDraft["priority"]; label: string }[] = [
  { value: "Low", label: "Χαμηλή" },
  { value: "Medium", label: "Κανονική" },
  { value: "High", label: "Υψηλή" },
  { value: "Urgent", label: "Επείγον" },
];

const editFieldLabel =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-gold)]";

type InlineEditDraft = {
  title: string;
  category: string;
  status: string;
  description: string;
  assigned_to: string;
  priority: "High" | "Medium" | "Low" | "Urgent";
};

type ContactCard = {
  id: string;
  person_id?: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
};

type RequestDetail = {
  id: string;
  request_code: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  contact_id: string;
  affected_contact_id: string | null;
  sla_due_date: string | null;
  sla_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  portal_message: string | null;
  portal_visible: boolean;
  requester: ContactCard | null;
  affected: ContactCard | null;
  requesters: ContactCard[];
  affected_list: ContactCard[];
  helpers: ContactCard[];
  handlers: string[];
  notes?: Note[];
};

type Note = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
  author_name?: string | null;
  author_full_name: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_by_name?: string | null;
  original_content?: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
  edited_by_name?: string | null;
};

type RequestNavInfo = {
  prev: string | null;
  next: string | null;
  position: number;
  total: number;
  fromSearch: boolean;
  atEnd?: boolean;
};

const OPEN = OPEN_REQUEST_STATUSES;

function formatDate(s: string | null | undefined) {
  return formatDateTimeEnGb(s);
}

function authorInitials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  if (w.length === 1) {
    return w[0]!.slice(0, 2).toUpperCase() || (w[0]![0] ?? "?").toUpperCase();
  }
  return `${w[0]![0] ?? ""}${w[1]![0] ?? ""}`.toUpperCase() || "?";
}

function PriorityBadge({ p }: { p: string | null | undefined }) {
  const k = p === "High" || p === "Low" || p === "Medium" ? p : "Medium";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityPill[k] ?? priorityPill.Medium}`}
    >
      {k}
    </span>
  );
}

function SlaBar({
  status,
  sla_due_date,
  created_at,
}: {
  status: string | null;
  sla_due_date: string | null;
  created_at: string | null;
}) {
  const normalizedStatus = normalizeRequestStatus(status ?? REQUEST_STATUS_OPEN);
  if (!sla_due_date) {
    return <p className="text-sm text-[var(--text-muted)]">Δεν ορίστηκε SLA.</p>;
  }
  if (!OPEN.has(normalizedStatus)) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">Το αίτημα δεν παρακολουθεί SLA (λήξη: {sla_due_date}).</p>
    );
  }
  const start = created_at ? new Date(created_at) : new Date();
  const due = new Date(sla_due_date + "T12:00:00");
  const now = new Date();
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const total = Math.max(1, Math.ceil((due.getTime() - start.getTime()) / 86_400_000));
  const left = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  const ui = computeSlaStatus(sla_due_date, normalizedStatus);
  const fillPct = Math.max(0, Math.min(100, (left / total) * 100));
  const barClass =
    ui === "overdue"
      ? "from-red-500/50 to-red-600/30"
      : ui === "at_risk"
        ? "from-amber-500/50 to-amber-600/25"
        : "from-emerald-500/45 to-emerald-600/25";
  return (
    <div className="w-full max-w-2xl">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">SLA</span>
        <span className="text-sm text-[var(--text-secondary)]">
          {left < 0
            ? `Ληξιπρόθεσμο κατά ${Math.abs(left)} ${Math.abs(left) === 1 ? "ημέρα" : "ημέρες"}`
            : left === 0
              ? "Λήγει σήμερα"
              : `Απομένουν ${left} ${left === 1 ? "ημέρα" : "ημέρες"}`}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-all duration-500`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">Προθεσμία: {formatCalendarDateOnly(sla_due_date)}</p>
    </div>
  );
}


export default function RequestDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--text-secondary)]" aria-busy>
          Φόρτωση…
        </div>
      }
    >
      <CrmErrorBoundary title="Δεν φορτώθηκε το αίτημα.">
        <RequestDetailPageInner />
      </CrmErrorBoundary>
    </Suspense>
  );
}

function RequestDetailPageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const resolveName = useResolveAuthorName();
  const { openRequestTab } = useContactTabs();
  const { categories, assignees, loading: filterOptionsLoading } = useRequestFilterOptions();
  const id = typeof params?.id === "string" ? params.id : "";
  const canEdit = can(profile, "requests_edit");
  const canManageNotes = hasMinRole(profile?.role, "manager", profile?.access_tier);
  const canDeleteRequest =
    can(profile, "requests_delete") ||
    hasMinRole(profile?.role, "manager", profile?.access_tier);
  const canAddNotes =
    can(profile, "requests_view") || hasMinRole(profile?.role, "caller", profile?.access_tier);
  const canViewAiSummary = can(profile, "ai_summary_view");
  const { showToast } = useFormToast();

  const [data, setData] = useState<RequestDetail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteDraft, setEditNoteDraft] = useState("");
  const [editNoteSaving, setEditNoteSaving] = useState(false);
  const [showOriginalNoteIds, setShowOriginalNoteIds] = useState<Record<string, boolean>>({});
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [portalMsg, setPortalMsg] = useState("");
  const [savingMsg, setSavingMsg] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [editingAll, setEditingAll] = useState(false);
  const [editDraft, setEditDraft] = useState<InlineEditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const editDescRef = useRef<HTMLTextAreaElement | null>(null);
  const [navInfo, setNavInfo] = useState<RequestNavInfo | null>(null);
  const requestApiId = useMemo(() => data?.id ?? id, [data?.id, id]);
  const alexPage = useOptionalAlexandraPageContext();

  const assigneeSelectOptions = useMemo(() => {
    const opts = assignees.map((a) => ({
      value: a.full_name?.trim() || a.id,
      label: formatAssigneeOptionLabel(a),
    }));
    const current = (editDraft?.assigned_to ?? data?.assigned_to)?.trim();
    if (current && !opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label: current });
    }
    return opts;
  }, [assignees, data?.assigned_to, editDraft?.assigned_to]);

  const categorySelectOptions = useMemo(() => {
    const opts = categories.map((c) => ({ value: c.name, label: c.name }));
    const current = (editDraft?.category ?? data?.category)?.trim();
    if (current && !opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label: current });
    }
    if (!opts.some((o) => o.value === "Άλλο")) {
      opts.push({ value: "Άλλο", label: "Άλλο" });
    }
    return opts;
  }, [categories, data?.category, editDraft?.category]);

  const adjustEditDescHeight = useCallback(() => {
    const el = editDescRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    if (!editingAll) return;
    adjustEditDescHeight();
  }, [editingAll, editDraft?.description, adjustEditDescHeight]);

  const fromSearchParam = searchParams.get("from") === "search";
  const fromSearchNav = Boolean(id && (fromSearchParam || isRequestsSearchNavActive(id)));

  const requestDetailHref = useCallback(
    (targetId: string) => {
      const params = new URLSearchParams();
      if (fromSearchNav) params.set("from", "search");
      const q = params.toString();
      return q ? `/requests/${targetId}?${q}` : `/requests/${targetId}`;
    },
    [fromSearchNav],
  );

  const setPageContext = alexPage?.setPageContext;
  useEffect(() => {
    if (!setPageContext) return;
    if (data) {
      setPageContext({
        type: "request",
        requestId: data.id,
        requestTitle: data.title,
        requestStatus: data.status ?? REQUEST_STATUS_OPEN,
      });
    } else {
      setPageContext(null);
    }
    return () => setPageContext(null);
  }, [setPageContext, data]);

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    try {
      const rRes = await fetchWithTimeout(`/api/requests/${encodeURIComponent(id)}`);
      const rj = await rRes.json();
      if (!rRes.ok) {
        setErr(String((rj as { error?: string }).error ?? "Σφάλμα"));
        return;
      }
      const req = (rj as { request: RequestDetail }).request;
      setData(req);
      setPortalMsg(req.portal_message?.trim() ?? "");
      setNotes(req.notes ?? []);
      void fetchWithTimeout(`/api/requests/${encodeURIComponent(req.id)}/view`, { method: "POST" }).catch(() => {});
      if (req.id && req.id !== id) {
        const qs = fromSearchNav ? "?from=search" : "";
        router.replace(`/requests/${req.id}${qs}`, { scroll: false });
      }
    } catch {
      setErr("Σφάλμα φόρτωσης");
    }
  }, [id, router, fromSearchNav]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const label =
      (data.request_code ? `#${data.request_code} ` : "") + (data.title?.trim() || "Αίτημα");
    openRequestTab(data.id, label);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per loaded request
  }, [data?.id, data?.title, data?.request_code, openRequestTab]);

  useEffect(() => {
    if (!id) return;

    const refreshNav = () => {
      try {
        const searchNav = loadRequestsSearchNav();
        const fromSearch =
          searchParams.get("from") === "search" ||
          Boolean(searchNav?.ids.includes(id));

        if (fromSearch && searchNav?.ids.includes(id)) {
          const idx = searchNav.ids.indexOf(id);
          const n = searchNav.ids.length;
          const reportTotal = Math.max(n, searchNav.total ?? n);
          const incomplete = reportTotal > n;
          const atEnd = idx >= n - 1 && !incomplete;
          setNavInfo({
            prev: idx > 0 ? (searchNav.ids[idx - 1] ?? null) : null,
            next: idx < n - 1 ? (searchNav.ids[idx + 1] ?? null) : null,
            position: idx + 1,
            total: reportTotal,
            fromSearch: true,
            atEnd,
          });
          return;
        }

        setNavInfo(null);
      } catch {
        setNavInfo(null);
      }
    };

    refreshNav();

    const onNavUpdate = (ev: Event) => {
      const key = (ev as CustomEvent<{ key?: string }>).detail?.key;
      if (key && key !== REQUESTS_SEARCH_NAV_KEY) return;
      refreshNav();
    };
    window.addEventListener(ENTITY_SEARCH_NAV_EVENT, onNavUpdate);
    return () => window.removeEventListener(ENTITY_SEARCH_NAV_EVENT, onNavUpdate);
  }, [id, searchParams]);

  const adjustDescTextareaHeight = useCallback(() => {
    const el = descTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, []);

  useEffect(() => {
    if (!editingDesc) return;
    adjustDescTextareaHeight();
  }, [editingDesc, descDraft, adjustDescTextareaHeight]);

  const startEditingDesc = useCallback(() => {
    if (!canEdit || !data) return;
    setDescDraft(data.description ?? "");
    setEditingDesc(true);
  }, [canEdit, data]);

  const cancelEditingDesc = useCallback(() => {
    setDescDraft(data?.description ?? "");
    setEditingDesc(false);
  }, [data?.description]);

  const startEditingAll = useCallback(() => {
    if (!canEdit || !data) return;
    setEditingDesc(false);
    const p = data.priority;
    setEditDraft({
      title: data.title ?? "",
      category: data.category?.trim() || "Άλλο",
      status: normalizeRequestStatus(data.status ?? REQUEST_STATUS_OPEN),
      description: data.description ?? "",
      assigned_to: data.assigned_to?.trim() ?? "",
      priority:
        p === "High" || p === "Low" || p === "Urgent" || p === "Medium" ? p : "Medium",
    });
    setEditingAll(true);
  }, [canEdit, data]);

  const cancelEditingAll = useCallback(() => {
    setEditDraft(null);
    setEditingAll(false);
  }, []);

  const saveEditingAll = useCallback(async () => {
    if (!requestApiId || !data || !editDraft || editSaving) return;
    const title = editDraft.title.trim();
    if (!title) {
      showToast("Ο τίτλος είναι υποχρεωτικός.", "error");
      return;
    }
    setEditSaving(true);
    try {
      const payload = {
        title,
        category: editDraft.category.trim() || null,
        status: normalizeRequestStatus(editDraft.status),
        description: editDraft.description.trim() || null,
        assigned_to: editDraft.assigned_to.trim() || null,
        priority: editDraft.priority,
      };
      const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestApiId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        request?: RequestDetail;
        status_note?: Note;
      };
      if (!res.ok || !body.request) {
        throw new Error(body.error ?? "Αποτυχία αποθήκευσης");
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              ...body.request,
              title: body.request?.title ?? title,
              category: body.request?.category ?? payload.category,
              status: body.request?.status ?? payload.status,
              description: body.request?.description ?? payload.description,
              assigned_to: body.request?.assigned_to ?? payload.assigned_to,
              priority: body.request?.priority ?? payload.priority,
            }
          : body.request ?? prev,
      );
      if (body.status_note) {
        setNotes((prev) => [body.status_note as Note, ...prev]);
      }
      setEditingAll(false);
      setEditDraft(null);
      showToast("Το αίτημα ενημερώθηκε.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Αποτυχία αποθήκευσης", "error");
    } finally {
      setEditSaving(false);
    }
  }, [data, editDraft, editSaving, requestApiId, showToast]);

  const saveDescription = useCallback(async () => {
    if (!requestApiId || !data || descSaving) return;
    const next = descDraft.slice(0, DESCRIPTION_MAX_LEN);
    const prev = (data.description ?? "").trim();
    const trimmed = next.trim();
    if (trimmed === prev) {
      setEditingDesc(false);
      setDescDraft(data.description ?? "");
      return;
    }
    setDescSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestApiId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed || null }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        request?: RequestDetail;
      };
      if (!res.ok || !body.request) {
        throw new Error(body.error ?? "Αποτυχία αποθήκευσης περιγραφής");
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              description: body.request?.description ?? (trimmed || null),
              updated_at: body.request?.updated_at ?? prev.updated_at,
            }
          : prev,
      );
      setEditingDesc(false);
      showToast("Η περιγραφή αποθηκεύτηκε.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Αποτυχία αποθήκευσης περιγραφής";
      showToast(message, "error");
    } finally {
      setDescSaving(false);
    }
  }, [data, descDraft, descSaving, requestApiId, showToast]);

  const handleStatusChange = useCallback(
    async (rawNextStatus: string) => {
      if (!requestApiId || !data) return;
      const previousStatus = data.status ?? REQUEST_STATUS_OPEN;
      const nextStatus = normalizeRequestStatus(rawNextStatus);
      if (normalizeRequestStatus(previousStatus) === nextStatus) return;

      const previousUpdatedAt = data.updated_at;
      const optimisticUpdatedAt = new Date().toISOString();

      setStatusSaving(true);
      setData((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              updated_at: optimisticUpdatedAt,
            }
          : prev,
      );

      try {
        const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestApiId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          request?: RequestDetail;
          status_note?: Note;
        };
        if (!res.ok || !body.request) {
          throw new Error(body.error ?? "Αποτυχία ενημέρωσης κατάστασης");
        }
        setData((prev) => (prev ? { ...prev, ...body.request } : body.request ?? prev));
        if (body.status_note) {
          setNotes((prev) => [body.status_note as Note, ...prev]);
        }
        showToast("Η κατάσταση ενημερώθηκε.", "success");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Αποτυχία ενημέρωσης κατάστασης";
        setData((prev) =>
          prev
            ? {
                ...prev,
                status: previousStatus,
                updated_at: previousUpdatedAt,
              }
            : prev,
        );
        showToast(message, "error");
      } finally {
        setStatusSaving(false);
      }
    },
    [data, requestApiId, showToast],
  );

  if (err && !data) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <button type="button" onClick={() => router.push("/requests")} className={lux.btnSecondary + " gap-1"}>
          <ArrowLeft className="h-4 w-4" /> Πίσω
        </button>
        <p className="text-red-300">{err}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6 text-sm text-[var(--text-secondary)]" aria-busy>
        Φόρτωση…
      </div>
    );
  }

  return (
    <div className="min-h-0 space-y-6 overflow-x-hidden p-4 pb-4 sm:p-6 sm:pb-6">
      <div className="mb-0 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (navInfo?.fromSearch || fromSearchNav) {
                router.push("/requests/search");
                return;
              }
              router.push("/requests");
            }}
            className={lux.btnSecondary + " inline-flex w-fit shrink-0 items-center gap-1.5 !py-1.5 text-xs sm:gap-2 sm:!py-2 sm:text-sm"}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            {navInfo?.fromSearch || fromSearchNav ? "Αναζήτηση" : "Λίστα αιτημάτων"}
          </button>
          {navInfo?.fromSearch || fromSearchNav ? (
            <button
              type="button"
              onClick={() => router.push("/requests/search")}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent-gold)_40%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_12%,var(--bg-elevated))] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-gold)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-gold)_20%,var(--bg-elevated))]"
            >
              Λίστα αποτελεσμάτων
            </button>
          ) : null}
        </div>
        {navInfo ? (
          <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => navInfo.prev && router.push(requestDetailHref(navInfo.prev))}
              disabled={!navInfo.prev}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40 sm:gap-1 sm:text-sm"
              aria-label="Προηγούμενο αποτέλεσμα"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
              <span className="hidden sm:inline">Προηγούμενο</span>
            </button>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--text-muted)] sm:text-xs">
              {navInfo.fromSearch
                ? `${navInfo.position} / ${navInfo.total} αποτελέσματα`
                : `${navInfo.position} / ${navInfo.total}`}
            </span>
            {navInfo.atEnd && navInfo.fromSearch ? (
              <button
                type="button"
                onClick={() => router.push("/requests/search")}
                className="inline-flex max-w-[14rem] min-h-[44px] items-center rounded-lg border border-[color-mix(in_srgb,var(--accent-gold)_40%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_10%,var(--bg-elevated))] px-2.5 py-2 text-left text-[10px] font-semibold leading-snug text-[var(--accent-gold)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-gold)_18%,var(--bg-elevated))] sm:max-w-none sm:text-[11px]"
              >
                Τέλος αποτελεσμάτων — Επιστροφή στην αναζήτηση
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navInfo.next && router.push(requestDetailHref(navInfo.next))}
                disabled={!navInfo.next}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40 sm:gap-1 sm:text-sm"
                aria-label="Επόμενο αποτέλεσμα"
              >
                <span className="hidden sm:inline">Επόμενο</span>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
              </button>
            )}
          </div>
        ) : null}
      </div>

      <header
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] sm:p-6"
        data-hq-card
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {data.request_code ? (
              <span className="inline-flex items-center rounded-lg border-2 border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-sm font-bold tracking-tight text-[var(--text-card-title)]">
                {data.request_code}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canDeleteRequest ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActionsMenuOpen((v) => !v)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                  aria-label="Περισσότερες ενέργειες"
                  aria-expanded={actionsMenuOpen}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden />
                </button>
                {actionsMenuOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      aria-label="Κλείσιμο μενού"
                      onClick={() => setActionsMenuOpen(false)}
                    />
                    <div className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setActionsMenuOpen(false);
                          setDeleteConfirmOpen(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Διαγραφή αιτήματος
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {canEdit && !editingAll ? (
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-gold)] hover:bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] hover:text-[var(--accent-gold)]"
                onClick={startEditingAll}
                aria-label="Επεξεργασία αιτήματος"
                title="Επεξεργασία"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {editingAll ? (
              <>
                <button
                  type="button"
                  className={lux.btnSecondary + " !min-h-[44px] !px-3 !py-2 !text-xs"}
                  disabled={editSaving}
                  onClick={cancelEditingAll}
                >
                  Άκυρο
                </button>
                <button
                  type="button"
                  className={lux.btnGold + " !min-h-[44px] !px-3 !py-2 !text-xs"}
                  disabled={editSaving}
                  onClick={() => void saveEditingAll()}
                >
                  {editSaving ? "…" : "Αποθήκευση"}
                </button>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <RequestStatusBadge status={data.status ?? REQUEST_STATUS_OPEN} size="md" bold />
                <PriorityBadge p={data.priority} />
              </div>
            )}
          </div>
        </div>

        {editingAll && editDraft ? (
          <div className="mt-5 space-y-4">
            <div className="w-full">
              <label className={editFieldLabel} htmlFor="req-edit-title">
                Τίτλος
              </label>
              <input
                id="req-edit-title"
                className={lux.input + " w-full"}
                value={editDraft.title}
                disabled={editSaving}
                onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
              />
            </div>

            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={editFieldLabel} htmlFor="req-edit-status">
                  Κατάσταση
                </label>
                <HqSelect
                  id="req-edit-status"
                  className="w-full"
                  value={normalizeRequestStatus(editDraft.status)}
                  disabled={editSaving}
                  onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value })}
                >
                  {REQUEST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </HqSelect>
              </div>
              <div className="min-w-0">
                <label className={editFieldLabel} htmlFor="req-edit-category">
                  Κατηγορία
                </label>
                <SearchableSelect
                  id="req-edit-category"
                  value={editDraft.category}
                  onChange={(value) => setEditDraft({ ...editDraft, category: value })}
                  options={categorySelectOptions}
                  placeholder="Επιλέξτε κατηγορία…"
                  searchPlaceholder="Αναζήτηση κατηγορίας…"
                  loading={filterOptionsLoading}
                  disabled={editSaving}
                  aria-label="Κατηγορία"
                />
              </div>
              <div className="min-w-0">
                <label className={editFieldLabel} htmlFor="req-edit-priority">
                  Προτεραιότητα
                </label>
                <HqSelect
                  id="req-edit-priority"
                  className="w-full"
                  value={editDraft.priority}
                  disabled={editSaving}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      priority: e.target.value as InlineEditDraft["priority"],
                    })
                  }
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </HqSelect>
              </div>
              <div className="min-w-0">
                <label className={editFieldLabel} htmlFor="req-edit-assignee">
                  Υπεύθυνος
                </label>
                <SearchableSelect
                  id="req-edit-assignee"
                  value={editDraft.assigned_to}
                  onChange={(value) => setEditDraft({ ...editDraft, assigned_to: value })}
                  options={[
                    { value: "", label: "— Χωρίς ανάθεση —" },
                    ...assigneeSelectOptions,
                  ]}
                  placeholder="Επιλέξτε υπεύθυνο…"
                  searchPlaceholder="Αναζήτηση υπευθύνου…"
                  loading={filterOptionsLoading}
                  disabled={editSaving}
                  aria-label="Υπεύθυνος"
                />
              </div>
            </div>

            <div className="w-full">
              <label className={editFieldLabel} htmlFor="req-edit-description">
                Περιγραφή
              </label>
              <textarea
                id="req-edit-description"
                ref={editDescRef}
                className={lux.textarea + " w-full !min-h-[120px] resize-none overflow-hidden"}
                value={editDraft.description}
                maxLength={DESCRIPTION_MAX_LEN}
                disabled={editSaving}
                onChange={(e) => {
                  setEditDraft({
                    ...editDraft,
                    description: e.target.value.slice(0, DESCRIPTION_MAX_LEN),
                  });
                }}
              />
              <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                {editDraft.description.length}/{DESCRIPTION_MAX_LEN}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--text-page-title)] sm:text-2xl">
                {data.title}
              </h1>
              {data.category ? (
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{data.category}</p>
              ) : null}
              {data.assigned_to?.trim() ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Υπεύθυνος: {resolveName(data.assigned_to)}
                </p>
              ) : null}
            </div>
            <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
              {canEdit ? (
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <label
                    htmlFor="request-inline-status"
                    className="text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Κατάσταση
                  </label>
                  <select
                    id="request-inline-status"
                    className={lux.select + " w-full !py-1.5 text-xs sm:min-w-[220px]"}
                    value={normalizeRequestStatus(data.status ?? REQUEST_STATUS_OPEN)}
                    disabled={statusSaving}
                    onChange={(e) => void handleStatusChange(e.target.value)}
                    aria-label="Αλλαγή κατάστασης αιτήματος"
                  >
                    {REQUEST_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <p className="text-xs text-[var(--text-muted)]">
                {statusSaving
                  ? "Ενημέρωση…"
                  : data.updated_at
                    ? `Ενημερώθηκε ${formatCalendarDateOnly(data.updated_at)}`
                    : "Ενημερώθηκε —"}
              </p>
            </div>
          </div>
        )}

        {editingAll ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {editSaving
              ? "Αποθήκευση…"
              : data.updated_at
                ? `Ενημερώθηκε ${formatCalendarDateOnly(data.updated_at)}`
                : null}
          </p>
        ) : null}

        {canViewAiSummary && requestApiId ? (
          <div className="mt-4">
            <AISummaryCard
              entityType="request"
              entityId={requestApiId}
              apiEndpoint={`/api/requests/${encodeURIComponent(requestApiId)}/ai-summary`}
              canManage={canViewAiSummary}
            />
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {!editingAll ? (
          <div className={lux.card + " p-5"}>
            <h2 className={lux.pageTitle + " !text-lg"}>Περιγραφή</h2>
            {canEdit && editingDesc ? (
              <div className="mt-2 space-y-2">
                <textarea
                  ref={descTextareaRef}
                  className={lux.textarea + " !min-h-[72px] resize-none overflow-hidden"}
                  value={descDraft}
                  maxLength={DESCRIPTION_MAX_LEN}
                  disabled={descSaving}
                  autoFocus
                  aria-label="Περιγραφή αιτήματος"
                  onChange={(e) => setDescDraft(e.target.value.slice(0, DESCRIPTION_MAX_LEN))}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditingDesc();
                    }
                  }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {descDraft.length}/{DESCRIPTION_MAX_LEN}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={lux.btnSecondary + " !min-h-0 !px-3 !py-1.5 !text-xs"}
                      disabled={descSaving}
                      onClick={cancelEditingDesc}
                    >
                      Άκυρο
                    </button>
                    <button
                      type="button"
                      className={lux.btnGold + " !min-h-0 !px-3 !py-1.5 !text-xs"}
                      disabled={descSaving}
                      onClick={() => void saveDescription()}
                    >
                      {descSaving ? "…" : "Αποθήκευση"}
                    </button>
                  </div>
                </div>
              </div>
            ) : canEdit ? (
              <button
                type="button"
                className="group mt-2 flex w-full items-start gap-2 rounded-md text-left transition hover:text-[#C9A84C]"
                onClick={startEditingDesc}
                aria-label="Επεξεργασία περιγραφής"
              >
                {data.description?.trim() ? (
                  <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-[var(--text-body)] group-hover:text-[#C9A84C]">
                    {data.description}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 text-sm text-[var(--text-muted)] group-hover:text-[#C9A84C]">
                    Προσθήκη περιγραφής...
                  </span>
                )}
                <Pencil
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-100 transition group-hover:text-[#C9A84C] sm:opacity-0 sm:group-hover:opacity-100"
                  aria-hidden
                />
              </button>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-body)]">
                {data.description?.trim() || (
                  <span className="text-[var(--text-muted)]">Χωρίς περιγραφή.</span>
                )}
              </p>
            )}
          </div>
          ) : null}

          {canEdit && (
            <div
              className="rounded-2xl border border-[var(--border)] border-l-[3px] border-l-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[var(--bg-card)]/95 p-5 shadow-sm"
              data-hq-card
            >
              <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Μήνυμα στον πολίτη</h2>
              <p className="mb-2 text-xs text-[var(--text-secondary)]">Εμφανίζεται στο portal του πολίτη (αίτημα) σε επισημασμένο πλαίσιο.</p>
              <textarea
                className="min-h-[72px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm"
                value={portalMsg}
                onChange={(e) => setPortalMsg(e.target.value)}
                disabled={savingMsg}
                placeholder="Σύντομη ενημέρωση…"
                aria-label="Μήνυμα portal"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className={lux.btnBlue + " !text-xs"}
                  disabled={savingMsg}
                  onClick={async () => {
                    if (!requestApiId) return;
                    setSavingMsg(true);
                    try {
                      const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestApiId)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ portal_message: portalMsg || null }),
                      });
                      if (res.ok) {
                        const rj = (await res.json()) as { request: RequestDetail };
                        setData(rj.request);
                      }
                    } finally {
                      setSavingMsg(false);
                    }
                  }}
                >
                  {savingMsg ? "…" : "Αποθήκευση μηνύματος"}
                </button>
              </div>
            </div>
          )}

          <RequestDocumentsSection requestId={requestApiId} canManage={canEdit} />

          <div
            className="rounded-2xl border border-[var(--border)] border-l-[3px] border-l-[var(--accent-gold)] bg-[var(--bg-card)]/95 p-5 shadow-sm"
            data-hq-card
          >
            <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Σημειώσεις (χρονολόγιο)</h2>
            <ul className="mb-4 max-h-[min(50vh,480px)] space-y-2.5 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <li className="text-xs text-[var(--text-muted)]">Καμία σημείωση ακόμα.</li>
              ) : (
                notes.map((note) => {
                  const isDeleted = Boolean(note.deleted_at);
                  const displayAuthor = note.author_name?.trim()
                    ? resolveName(note.author_name)
                    : note.author_full_name || "—";
                  const canEditThis =
                    !isDeleted &&
                    ((note.user_id != null && note.user_id === profile?.id) || canManageNotes);
                  const canDeleteThis = canManageNotes && !isDeleted;
                  const isEditing = editingNoteId === note.id;
                  const wasEdited =
                    Boolean(note.edited_at) ||
                    (Boolean(note.updated_at) && note.updated_at !== note.created_at);
                  const showOriginal = Boolean(showOriginalNoteIds[note.id]);
                  const deletedByLabel = note.deleted_by_name
                    ? resolveName(note.deleted_by_name)
                    : "—";
                  const editedByLabel = note.edited_by_name
                    ? resolveName(note.edited_by_name)
                    : null;
                  return (
                  <li key={note.id}>
                    <div
                      className={
                        "group relative rounded-md border border-l-[3px] p-3 pl-3 pr-2 " +
                        (isDeleted
                          ? "border-red-500/25 border-l-red-400/60 bg-red-500/5"
                          : "border-[var(--border)] border-l-[var(--accent-gold)] bg-[var(--bg-elevated)]/35")
                      }
                    >
                      {!isEditing && !isDeleted && (
                        <div className="absolute right-1.5 top-1.5 z-[1] flex items-center gap-0.5">
                          {canEditThis && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditNoteDraft(note.content);
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] opacity-100 transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] md:opacity-0 md:group-hover:opacity-100"
                              title="Επεξεργασία"
                              aria-label="Επεξεργασία σημείωσης"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDeleteThis && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!requestApiId) return;
                                const dres = await fetchWithTimeout(
                                  `/api/requests/${encodeURIComponent(requestApiId)}/notes/${note.id}`,
                                  { method: "DELETE" },
                                );
                                if (dres.ok) {
                                  const j = (await dres.json().catch(() => ({}))) as { note?: Note };
                                  if (j.note) {
                                    setNotes((prev) =>
                                      prev.map((x) => (x.id === note.id ? { ...x, ...j.note } : x)),
                                    );
                                  } else {
                                    setNotes((prev) =>
                                      prev.map((x) =>
                                        x.id === note.id
                                          ? {
                                              ...x,
                                              deleted_at: new Date().toISOString(),
                                              deleted_by_name: profile?.full_name ?? "—",
                                            }
                                          : x,
                                      ),
                                    );
                                  }
                                  if (editingNoteId === note.id) {
                                    setEditingNoteId(null);
                                    setEditNoteDraft("");
                                  }
                                }
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] opacity-100 transition hover:bg-[var(--bg-card)] hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                              title="Διαγραφή"
                              aria-label="Διαγραφή σημείωσης"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex gap-3 pr-5">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] font-bold text-[var(--text-primary)]"
                          aria-hidden
                        >
                          {authorInitials(displayAuthor)}
                        </div>
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex flex-col gap-2">
                              <textarea
                                className="min-h-[72px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-2.5 text-sm text-[var(--text-input)] focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/20"
                                value={editNoteDraft}
                                onChange={(e) => setEditNoteDraft(e.target.value)}
                                disabled={editNoteSaving}
                                autoFocus
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={editNoteSaving || !editNoteDraft.trim()}
                                  onClick={async () => {
                                    if (!requestApiId || !editNoteDraft.trim()) return;
                                    setEditNoteSaving(true);
                                    try {
                                      const res = await fetchWithTimeout(
                                        `/api/requests/${encodeURIComponent(requestApiId)}/notes/${note.id}`,
                                        {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ content: editNoteDraft.trim() }),
                                        },
                                      );
                                      if (res.ok) {
                                        const j = (await res.json()) as { note?: Note };
                                        if (j.note) {
                                          setNotes((prev) =>
                                            prev.map((x) => (x.id === note.id ? { ...x, ...j.note } : x)),
                                          );
                                        }
                                        setEditingNoteId(null);
                                        setEditNoteDraft("");
                                      } else {
                                        const j = (await res.json().catch(() => ({}))) as { error?: string };
                                        showToast(j.error ?? "Αποτυχία αποθήκευσης σημείωσης", "error");
                                      }
                                    } finally {
                                      setEditNoteSaving(false);
                                    }
                                  }}
                                  className={lux.btnBlue + " !min-h-8 !text-xs"}
                                >
                                  {editNoteSaving ? "…" : "Αποθήκευση"}
                                </button>
                                <button
                                  type="button"
                                  disabled={editNoteSaving}
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditNoteDraft("");
                                  }}
                                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                                >
                                  Άκυρο
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p
                                className={
                                  "whitespace-pre-wrap text-sm " +
                                  (isDeleted
                                    ? "italic text-[var(--text-muted)] line-through"
                                    : "text-[var(--text-primary)]")
                                }
                              >
                                {note.content}
                              </p>
                              {isDeleted ? (
                                <p className="mt-1.5 text-xs italic text-red-400/90">
                                  Διαγράφηκε από {deletedByLabel} στις {formatDate(note.deleted_at)}
                                </p>
                              ) : (
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  {displayAuthor && displayAuthor !== "—" && (
                                    <span className="text-xs font-medium text-primary/70">{displayAuthor}</span>
                                  )}
                                  {displayAuthor && displayAuthor !== "—" && (
                                    <span className="text-xs text-muted-foreground">·</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                                  {wasEdited && (
                                    <>
                                      <span className="text-xs text-muted-foreground">·</span>
                                      <span className="text-xs text-muted-foreground">
                                        Επεξεργάστηκε από {editedByLabel || displayAuthor} στις{" "}
                                        {formatDate(note.edited_at ?? note.updated_at)}
                                      </span>
                                    </>
                                  )}
                                  {note.original_content ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setShowOriginalNoteIds((prev) => ({
                                          ...prev,
                                          [note.id]: !prev[note.id],
                                        }))
                                      }
                                      className="text-xs font-medium text-[var(--accent-gold)] hover:underline"
                                    >
                                      {showOriginal ? "Απόκρυψη αρχικού" : "Εμφάνιση αρχικού"}
                                    </button>
                                  ) : null}
                                </div>
                              )}
                              {showOriginal && note.original_content && !isDeleted ? (
                                <p className="mt-2 whitespace-pre-wrap rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-card)]/60 p-2 text-xs italic text-[var(--text-muted)]">
                                  {note.original_content}
                                </p>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                  );
                })
              )}
            </ul>
            {canAddNotes && (
              <div className="mt-1 flex flex-col gap-2 border-t border-[var(--border)]/80 pt-3">
                <textarea
                  className="min-h-[80px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-sm text-[var(--text-input)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/20"
                  placeholder="Νέα σημείωση…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  disabled={sending}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className={lux.btnBlue + " !text-xs"}
                    disabled={sending || !noteDraft.trim()}
                    onClick={async () => {
                      if (!noteDraft.trim() || !requestApiId) return;
                      setSending(true);
                      try {
                        const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestApiId)}/notes`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ content: noteDraft.trim() }),
                        });
                        if (res.ok) {
                          const j = (await res.json()) as { note?: Note };
                          if (j.note) {
                            setNotes((prev) => [j.note as Note, ...prev]);
                          }
                          setNoteDraft("");
                        } else {
                          const j = (await res.json().catch(() => ({}))) as { error?: string };
                          showToast(j.error ?? "Αποτυχία αποθήκευσης σημείωσης", "error");
                        }
                      } finally {
                        setSending(false);
                      }
                    }}
                  >
                    {sending ? "…" : "Αποστολή"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <RequestPersonsSections
            requestId={requestApiId}
            requesters={data.requesters ?? (data.requester ? [data.requester] : [])}
            affected={data.affected_list ?? (data.affected ? [data.affected] : [])}
            helpers={data.helpers ?? []}
            handlerNames={data.handlers ?? []}
            canManage={canEdit}
            onChanged={() => void load()}
          />
        </aside>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5" data-hq-card>
        <SlaBar status={data.status} sla_due_date={data.sla_due_date} created_at={data.created_at} />
      </div>

      {deleteConfirmOpen ? (
        <CenteredModal
          open
          onClose={() => {
            if (!deletingRequest) setDeleteConfirmOpen(false);
          }}
          title="Διαγραφή αιτήματος"
          ariaLabel="Διαγραφή αιτήματος"
          className="!max-w-sm"
          footer={
            <>
              <button
                type="button"
                className={lux.btnSecondary}
                disabled={deletingRequest}
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnDanger}
                disabled={deletingRequest}
                onClick={async () => {
                  if (!requestApiId) return;
                  setDeletingRequest(true);
                  try {
                    const res = await fetchWithTimeout(
                      `/api/requests/${encodeURIComponent(requestApiId)}`,
                      { method: "DELETE" },
                    );
                    const j = (await res.json().catch(() => ({}))) as { error?: string };
                    if (!res.ok) {
                      showToast(j.error ?? "Αποτυχία διαγραφής", "error");
                      return;
                    }
                    showToast("Το αίτημα διαγράφηκε.", "success");
                    router.push("/requests");
                  } catch {
                    showToast("Σφάλμα δικτύου.", "error");
                  } finally {
                    setDeletingRequest(false);
                    setDeleteConfirmOpen(false);
                  }
                }}
              >
                {deletingRequest ? "…" : "Διαγραφή"}
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--text-secondary)]">
            Να διαγραφεί οριστικά αυτό το αίτημα; Αυτό δεν ανακαλείται.
          </p>
        </CenteredModal>
      ) : null}
    </div>
  );
}
