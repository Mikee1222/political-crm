"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Building2,
  Cake,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Gift,
  MapPin,
  Maximize2,
  Minimize2,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  formatCalendarDateOnly,
  formatCallLogDateTime,
  formatDateAthens,
  formatDateTimeAthens,
  formatDateTimeEnGb,
  formatRelativeAthens,
} from "@/lib/date-format";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useProfile } from "@/contexts/profile-context";
import { useContactTabs } from "@/contexts/contact-tabs-context";
import { useOptionalAlexandraPageContact } from "@/contexts/alexandra-page-context";
import { can } from "@/lib/can";
import { hasMinRole } from "@/lib/roles";
import { REQUEST_STATUSES, REQUEST_STATUS_OPEN } from "@/lib/request-statuses";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { callStatusLabel, callStatusPill, lux, priorityPill } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { ContactElectoralLocationEdit } from "@/components/contact-electoral-location-edit";
import { ContactGroupsSection } from "@/components/contact-groups-section";
import { AISummaryCard } from "@/components/ai-summary-card";
import { ContactExtraSections } from "@/components/contact-extra-sections";
import { ContactRelatedPersonsSection } from "@/components/contact-related-persons-section";
import { CrmErrorBoundary } from "@/components/crm-error-boundary";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { ContactGroupRow } from "@/lib/contact-groups";
import { useFormToast } from "@/contexts/form-toast-context";
import { getAgeFromBirthday, getDaysUntilBirthday } from "@/lib/contact-birthday";
import { CONTACT_CALL_STATUS_OPTIONS } from "@/lib/call-status-options";
import { cn } from "@/lib/utils";
import { ContactStatusBadges } from "@/components/contacts/contact-status-badges";

const card =
  "contact-card-in break-inside-avoid rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)]/95 p-5 shadow-sm";
const cardGold = `${card} border-l-[3px] border-l-[var(--accent-gold)]`;
const cardBlue = `${card} border-l-[3px] border-l-[var(--accent-blue)]`;
const cardGreen = `${card} border-l-[3px] !border-l-[#10B981]`;
const cardTitle =
  "mb-4 border-b border-[var(--border)]/80 pb-3 text-sm font-semibold tracking-wide text-[var(--text-primary)]";
function animDelay(n: number) {
  return { style: { animationDelay: `${n * 50}ms` } as React.CSSProperties };
}
function ProfileField({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
      <span className="mt-0.5 shrink-0 text-[var(--accent-gold)]/90 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug text-[var(--text-primary)]">{value || "—"}</p>
      </div>
    </div>
  );
}
const lbl = "text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--text-muted)]";
const val = "text-sm text-[var(--text-primary)]";
const fieldGap = "flex flex-col gap-2";
const grid2 = "grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2";
const inputSm =
  "h-9 w-full min-h-[44px] max-w-full rounded-lg border border-[var(--border)] px-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)]/20 max-md:min-h-[48px] max-md:text-base";
const mobileEditOverlay =
  "max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:top-0 z-[100] m-0 max-h-[100dvh] w-full max-w-full max-md:overflow-y-auto max-md:overflow-x-hidden max-md:rounded-none max-md:border-0 max-md:shadow-2xl max-md:p-4 max-md:pt-[max(0.5rem,env(safe-area-inset-top,0px))] max-md:pb-[max(1rem,env(safe-area-inset-bottom,0px))]";
const btnEdit = lux.linkAction;

type Call = {
  id: string;
  called_at: string | null;
  outcome: string | null;
  notes: string | null;
  duration_seconds: number | null;
};
type Task = { id: string; title: string; due_date: string | null; completed: boolean };
type RequestItem = {
  id: string;
  request_code?: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  assigned_to: string | null;
  created_at: string | null;
};

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
  email: string | null;
  area: string | null;
  age: number | null;
  gender: string | null;
  occupation: string | null;
  source: string | null;
  political_stance: string | null;
  priority: string | null;
  influence: boolean | null;
  tags: string[] | null;
  nickname: string | null;
  spouse_name: string | null;
  name_day: string | null;
  contact_code: string | null;
  father_name: string | null;
  mother_name: string | null;
  birthday: string | null;
  municipality: string | null;
  electoral_district: string | null;
  toponym: string | null;
  call_status: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  author_name?: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  group_id: string | null;
  is_volunteer?: boolean | null;
  volunteer_role?: string | null;
  volunteer_area?: string | null;
  volunteer_since?: string | null;
  language?: string | null;
  last_contacted_at?: string | null;
  last_contacted_by?: string | null;
  dimotologio?: string | null;
  is_dead?: boolean | null;
  contact_groups?: Pick<ContactGroupRow, "id" | "name" | "color" | "description" | "year"> | null;
  all_groups?: Pick<ContactGroupRow, "id" | "name" | "color" | "description" | "year">[];
};

type ContactAddressRow = {
  id: string;
  type: string;
  odos: string | null;
  poli: string | null;
  tk: string | null;
  send_post: boolean | null;
};

type ContactEventRow = {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  type: string | null;
  status: string | null;
  rsvp_status: string | null;
};

type ContactSourceRow = {
  id: string;
  name: string;
};

type ContactNavInfo = {
  prev: string | null;
  next: string | null;
  position: number;
  total: number;
};

type SupporterRow = {
  id: string;
  support_type: string | null;
  amount: number | null;
  date: string | null;
  notes: string | null;
  created_at: string;
};

type ContactNoteItem = {
  id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  author_name?: string | null;
  author_full_name: string;
};

type ContactCallLogItem = {
  id: string;
  contact_id: string;
  called_at: string;
  marked_by_user_id: string | null;
  marked_by_name: string | null;
  marker_name: string | null;
};

const CALL_OPTS = CONTACT_CALL_STATUS_OPTIONS;

function disp(v: string | null | undefined) {
  if (v == null || String(v).trim() === "") return "—";
  return v;
}

/** [Επίθετο] [Μικρό] του [Πατρώνυμο] */
function greekHeaderPrimaryLine(lastName: string, firstName: string, fatherName: string | null | undefined) {
  const l = (lastName ?? "").trim();
  const f = (firstName ?? "").trim();
  const p = (fatherName ?? "").trim();
  const core = [l, f].filter(Boolean).join(" ");
  if (!core) return "Επαφή";
  if (p) return `${core} του ${p}`;
  return core;
}

function greekHeaderMotherLine(motherName: string | null | undefined) {
  const m = (motherName ?? "").trim();
  if (!m) return null;
  return `και της ${m}`;
}

function buildContactCopyText(c: Contact) {
  const line1 = greekHeaderPrimaryLine(c.last_name, c.first_name, c.father_name);
  const line2 = greekHeaderMotherLine(c.mother_name);
  const phone = c.phone?.trim() || "";
  const p2 = c.phone2?.trim() || "";
  const ll = c.landline?.trim() || "";
  return [
    line1,
    ...(line2 ? [line2] : []),
    c.contact_code ? `Κωδικός: ${c.contact_code}` : null,
    phone ? `Κινητό 1: ${phone}` : null,
    p2 ? `Κινητό 2: ${p2}` : null,
    ll ? `Σταθερό: ${ll}` : null,
    c.email?.trim() ? `Email: ${c.email}` : null,
    c.municipality?.trim() ? `Τοποθεσία: ${c.municipality}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

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

function OutcomeBadge({ o }: { o: string | null | undefined }) {
  const t = o ?? "—";
  const map: Record<string, string> = {
    Positive: "bg-[rgba(16,185,129,0.15)] text-[#10B981] ring-1 ring-[rgba(16,185,129,0.35)]",
    Negative: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
    "No Answer": "bg-[rgba(245,158,11,0.15)] text-[#F59E0B] ring-1 ring-[rgba(245,158,11,0.35)]",
  };
  const cls = map[t] ?? "bg-[var(--bg-elevated)] text-[var(--text-secondary)] ring-1 ring-[var(--border)]";
  const el: Record<string, string> = { Positive: "Θετικό", Negative: "Αρνητικό", "No Answer": "Δεν απάντησε" };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {el[t] ?? t}
    </span>
  );
}

function ReqStatus({ s }: { s: string | null | undefined }) {
  return <RequestStatusBadge status={s ?? REQUEST_STATUS_OPEN} size="xs" />;
}

const inlineFormLabel =
  "mb-1 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground";
const inlineFormControl =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/40 max-md:min-h-[44px] max-md:text-base";

type Section = "personal" | "electoral" | "comm" | null;

function CopyClipButton({ text, "aria-label": ariaLabel }: { text: string; "aria-label": string }) {
  const [ok, setOk] = useState(false);
  const t = String(text ?? "").trim();
  const disabled = t.length === 0;
  return (
    <div className="relative flex shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={async () => {
          if (disabled) return;
          try {
            await navigator.clipboard.writeText(t);
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          } catch {
            /* ignore */
          }
        }}
        className={[
          "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)]",
          "bg-[var(--bg-elevated)] text-[var(--text-muted)] transition",
          "hover:border-[var(--accent-gold)]/50 hover:text-[var(--accent-gold)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/30 focus:border-[var(--accent-gold)]",
          disabled ? "pointer-events-none opacity-35" : "",
        ].join(" ")}
        aria-label={ariaLabel}
      >
        <Clipboard className="h-3.5 w-3.5" />
      </button>
      {ok && (
        <span
          className="absolute right-0 top-full z-20 mt-1.5 select-none rounded-md border border-[var(--accent-gold)]/30 bg-[var(--bg-card)] px-2 py-1 text-[10px] font-medium whitespace-nowrap text-[var(--accent-gold)] shadow-md"
          role="status"
        >
          <span className="inline-flex items-center gap-1">
            <Check className="h-3 w-3" aria-hidden />
            Αντιγράφηκε
          </span>
        </span>
      )}
    </div>
  );
}

function QuickCopyRow({ label, value, mono, copyLabel }: { label: string; value: string; mono?: boolean; copyLabel: string }) {
  const v = value ?? "";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <p className={`min-w-0 flex-1 truncate text-sm text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>{v || "—"}</p>
      <CopyClipButton text={v} aria-label={copyLabel} />
    </div>
  );
}

function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { profile } = useProfile();
  const { openTab } = useContactTabs();
  const isCaller = profile?.role === "caller";
  const canManage = hasMinRole(profile?.role, "manager", profile?.access_tier);
  const canEdit = can(profile, "contacts_edit");
  const canDeleteCommLogs = can(profile, "communication_logs_delete");
  const { showToast } = useFormToast();
  const [contact, setContact] = useState<Contact | null>(null);
  const [buf, setBuf] = useState<Contact | null>(null);
  const [editing, setEditing] = useState<Section>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [newRequest, setNewRequest] = useState({
    title: "",
    description: "",
    category: "Άλλο",
    status: REQUEST_STATUS_OPEN,
    assigned_to: "",
  });
  const [openReq, setOpenReq] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [openTask, setOpenTask] = useState(false);
  const [headerCopied, setHeaderCopied] = useState(false);
  const [groupOptions, setGroupOptions] = useState<ContactGroupRow[]>([]);
  const [availableSources, setAvailableSources] = useState<ContactSourceRow[]>([]);
  const [contactSources, setContactSources] = useState<ContactSourceRow[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesSaving, setSourcesSaving] = useState(false);
  const [supporters, setSupporters] = useState<SupporterRow[]>([]);
  const [newSup, setNewSup] = useState({ support_type: "Οικονομική", amount: "", date: "", notes: "" });
  const [contactNotes, setContactNotes] = useState<ContactNoteItem[]>([]);
  const [callLogs, setCallLogs] = useState<ContactCallLogItem[]>([]);
  const [markingContacted, setMarkingContacted] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSending, setNoteSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<
    {
      id: string;
      user_name: string;
      action: string;
      entity_type: string;
      entity_name: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
    }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [addresses, setAddresses] = useState<ContactAddressRow[]>([]);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    type: "Οικία",
    odos: "",
    poli: "",
    tk: "",
    send_post: false,
  });
  const [navInfo, setNavInfo] = useState<ContactNavInfo | null>(null);
  const [contactEvents, setContactEvents] = useState<ContactEventRow[]>([]);
  const [calendarYearsBack, setCalendarYearsBack] = useState(0);
  const [calendarYearsForward, setCalendarYearsForward] = useState(1);
  const [eventsLoading, setEventsLoading] = useState(false);
  const alexPage = useOptionalAlexandraPageContact();
  const aliveRef = useRef(true);

  const contactDetailHref = useCallback(
    (targetId: string) => (focusMode ? `/contacts/${targetId}?focus=1` : `/contacts/${targetId}`),
    [focusMode],
  );

  const applyFocusModeDom = useCallback((val: boolean) => {
    if (val) document.body.classList.add("focus-mode");
    else document.body.classList.remove("focus-mode");
  }, []);

  const handleSetFocusMode = useCallback(
    (val: boolean) => {
      setFocusMode(val);
      applyFocusModeDom(val);
      const params = new URLSearchParams(window.location.search);
      if (val) params.set("focus", "1");
      else params.delete("focus");
      const q = params.toString();
      const path = window.location.pathname;
      window.history.replaceState(null, "", q ? `${path}?${q}` : path);
    },
    [applyFocusModeDom],
  );
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      const dead = () => Boolean(signal?.aborted) || !aliveRef.current;
      const apply = (fn: () => void) => {
        startTransition(() => {
          if (dead()) return;
          fn();
        });
      };
      try {
        const [res, notesRes, logsRes] = await Promise.all([
          fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}`, { signal }),
          fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/notes`, { signal }),
          fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/call-logs`, { signal }),
        ]);
        if (dead()) return;
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          contact?: Contact | null;
          calls?: Call[];
          tasks?: Task[];
          requests?: RequestItem[];
        };
        let notes: ContactNoteItem[] = [];
        if (notesRes.ok) {
          try {
            const njson = (await notesRes.json()) as { notes?: ContactNoteItem[] };
            notes = njson.notes ?? [];
          } catch {
            notes = [];
          }
        }
        let logs: ContactCallLogItem[] = [];
        if (logsRes.ok) {
          try {
            const ljson = (await logsRes.json()) as { logs?: ContactCallLogItem[] };
            logs = ljson.logs ?? [];
          } catch {
            logs = [];
          }
        }
        if (dead()) return;
        if (data.error) {
          apply(() => {
            setContact(null);
            setContactNotes([]);
            setCallLogs([]);
            setBuf(null);
            setEditing(null);
            setCalls([]);
            setTasks([]);
            setRequests([]);
            setSupporters([]);
          });
          return;
        }
        const raw = data.contact as Contact | null;
        const calls = (data.calls ?? []) as Call[];
        const tasks = (data.tasks ?? []) as Task[];
        const requests = (data.requests ?? []) as RequestItem[];
        let supporters: SupporterRow[] = [];
        if (hasMinRole(profile?.role, "manager")) {
          try {
            const sr = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/supporters`, { signal });
            if (dead()) return;
            if (sr.ok) {
              try {
                const sj = (await sr.json()) as { items?: SupporterRow[] };
                supporters = sj.items ?? [];
              } catch {
                supporters = [];
              }
            } else {
              supporters = [];
            }
          } catch {
            supporters = [];
          }
        }
        if (dead()) return;
        apply(() => {
          setContactNotes(notes);
          setCallLogs(logs);
          if (raw) {
            const g = raw.contact_groups;
            const contact_groups = Array.isArray(g) ? g[0] ?? null : g ?? null;
            const all_groups =
              raw.all_groups?.length
                ? raw.all_groups
                : contact_groups
                  ? [contact_groups]
                  : [];
            setContact({
              ...raw,
              contact_groups,
              all_groups,
              group_id: raw.group_id ?? null,
              phone2: raw.phone2 ?? null,
              landline: raw.landline ?? null,
            });
          } else {
            setContact(null);
          }
          setBuf(null);
          setEditing(null);
          setCalls(calls);
          setTasks(tasks);
          setRequests(requests);
          setSupporters(supporters);
        });
      } catch {
        if (dead()) return;
        apply(() => {
          setContact(null);
          setContactNotes([]);
          setCallLogs([]);
          setSupporters([]);
          setCalls([]);
          setTasks([]);
          setRequests([]);
        });
      }
    },
    [id, profile?.role],
  );

  const loadSources = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      setSourcesLoading(true);
      try {
        const res = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/sources`, { signal });
        if (signal?.aborted) return;
        if (!res.ok) {
          setContactSources([]);
          return;
        }
        const data = (await res.json()) as { sources?: ContactSourceRow[] };
        if (!signal?.aborted) {
          setContactSources(data.sources ?? []);
        }
      } catch {
        if (!signal?.aborted) {
          setContactSources([]);
        }
      } finally {
        if (!signal?.aborted) {
          setSourcesLoading(false);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => {
      ac.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!contact) return;
    const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Επαφή";
    openTab(contact.id, name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, contact?.first_name, contact?.last_name, openTab]);

  const setPageContext = alexPage?.setPageContext;
  useEffect(() => {
    if (!setPageContext) return;
    if (!contact || contact.id !== id) {
      setPageContext(null);
      return;
    }
    const name = `${contact.first_name} ${contact.last_name}`.trim();
    setPageContext({
      type: "contact",
      contactId: contact.id,
      contactName: name || "Επαφή",
      contactData: {
        phone: contact.phone ?? undefined,
        municipality: contact.municipality ?? undefined,
        groups: (contact.all_groups ?? []).map((g) => g.name),
        call_status: contact.call_status ?? undefined,
        notes_count: contactNotes.length,
        requests_count: requests.length,
      },
    });
    return () => {
      setPageContext(null);
    };
    // Primitives only — `contact` identity updates on every fetch and would retrigger Alexandra sync in a loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setPageContext,
    id,
    contact?.id,
    contact?.first_name,
    contact?.last_name,
    contact?.phone,
    contact?.municipality,
    contact?.call_status,
    contact?.all_groups,
    contactNotes.length,
    requests.length,
  ]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetchWithTimeout("/api/groups", { signal: ac.signal });
        if (ac.signal.aborted) return;
        const d = (await r.json()) as { groups?: ContactGroupRow[] };
        if (ac.signal.aborted) return;
        setGroupOptions(d.groups ?? []);
      } catch {
        if (ac.signal.aborted) return;
        setGroupOptions([]);
      }
    })();
    return () => {
      ac.abort();
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetchWithTimeout("/api/contact-sources", { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setAvailableSources([]);
          return;
        }
        const data = (await res.json()) as { sources?: ContactSourceRow[] };
        if (!ac.signal.aborted) {
          setAvailableSources(data.sources ?? []);
        }
      } catch {
        if (!ac.signal.aborted) {
          setAvailableSources([]);
        }
      }
    })();
    return () => {
      ac.abort();
    };
  }, []);

  const callStatusSearchOptions = useMemo(
    () => CALL_OPTS.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const sourceOptions = useMemo(() => {
    const byId = new Map<string, ContactSourceRow>();
    for (const source of availableSources) byId.set(source.id, source);
    for (const source of contactSources) {
      if (!byId.has(source.id)) byId.set(source.id, source);
    }
    return [...byId.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "el"))
      .map((source) => ({ value: source.id, label: source.name }));
  }, [availableSources, contactSources]);

  const selectedSourceIds = useMemo(
    () => contactSources.map((source) => source.id),
    [contactSources],
  );

  useEffect(() => {
    if (!canManage || !id || !historyOpen) {
      return;
    }
    const ac = new AbortController();
    setHistoryLoading(true);
    void (async () => {
      try {
        const res = await fetchWithTimeout(`/api/contacts/${id}/history`, { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (res.ok) {
          const j = (await res.json()) as {
            entries?: {
              id: string;
              user_id: string | null;
              action: string;
              entity_type: string;
              entity_name: string | null;
              details: unknown;
              created_at: string;
              user_name?: string;
            }[];
          };
          if (ac.signal.aborted) return;
          setHistoryRows(
            (j.entries ?? []).map((e) => ({
              id: e.id,
              user_name: e.user_name ?? "—",
              action: e.action,
              entity_type: e.entity_type,
              entity_name: e.entity_name,
              details: (e.details as Record<string, unknown>) ?? null,
              created_at: e.created_at,
            })),
          );
        } else {
          setHistoryRows([]);
        }
      } catch {
        if (!ac.signal.aborted) {
          setHistoryRows([]);
        }
      } finally {
        if (!ac.signal.aborted) {
          setHistoryLoading(false);
        }
      }
    })();
    return () => {
      ac.abort();
      setHistoryLoading(false);
    };
  }, [canManage, id, historyOpen]);

  useEffect(() => {
    return () => {
      try {
        router.prefetch("/contacts");
      } catch {
        /* ignore */
      }
    };
  }, [router]);

  useEffect(() => {
    const enabled = searchParams.get("focus") === "1";
    setFocusMode(enabled);
    applyFocusModeDom(enabled);
  }, [searchParams, applyFocusModeDom]);

  useEffect(() => {
    return () => document.body.classList.remove("focus-mode");
  }, []);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/addresses`, {
          signal: ac.signal,
        });
        if (!res.ok) return;
        const d = (await res.json()) as { addresses?: ContactAddressRow[] };
        if (!ac.signal.aborted) setAddresses(d.addresses ?? []);
      } catch {
        if (!ac.signal.aborted) setAddresses([]);
      }
    })();
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    const ac = new AbortController();
    void loadSources(ac.signal);
    return () => ac.abort();
  }, [loadSources]);

  useEffect(() => {
    if (!id) return;
    try {
      const stored = sessionStorage.getItem("contacts_nav");
      if (!stored) {
        setNavInfo(null);
        return;
      }
      const nav = JSON.parse(stored) as { ids?: string[] };
      const ids = nav.ids ?? [];
      const idx = ids.indexOf(id);
      if (idx === -1) {
        setNavInfo(null);
        return;
      }
      setNavInfo({
        prev: ids[idx - 1] ?? null,
        next: ids[idx + 1] ?? null,
        position: idx + 1,
        total: ids.length,
      });
    } catch {
      setNavInfo(null);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    setEventsLoading(true);
    void (async () => {
      try {
        const q = new URLSearchParams({
          years_back: String(calendarYearsBack),
          years_forward: String(calendarYearsForward),
        });
        const res = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/events?${q}`, {
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setContactEvents([]);
          return;
        }
        const d = (await res.json()) as { events?: ContactEventRow[] };
        if (!ac.signal.aborted) setContactEvents(d.events ?? []);
      } catch {
        if (!ac.signal.aborted) setContactEvents([]);
      } finally {
        if (!ac.signal.aborted) setEventsLoading(false);
      }
    })();
    return () => ac.abort();
  }, [id, calendarYearsBack, calendarYearsForward]);

  useEffect(() => {
    if (!focusMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSetFocusMode(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode, handleSetFocusMode]);

  const c = contact;
  const w = buf ?? c;
  const latestCommLog = callLogs[0] ?? null;
  const lastCommAt = latestCommLog?.called_at ?? c?.last_contacted_at ?? null;
  const lastCommMarker =
    latestCommLog?.marker_name?.trim() || c?.last_contacted_by?.trim() || latestCommLog?.marked_by_name?.trim() || null;

  const startEdit = (s: Exclude<Section, null>) => {
    if (!c || !canEdit) return;
    setBuf({ ...c });
    setEditing(s);
  };
  const cancelEdit = () => {
    setBuf(null);
    setEditing(null);
  };

  const handleGroupsChange = useCallback(
    (allGroups: NonNullable<Contact["all_groups"]>) => {
      setContact((prev) =>
        prev
          ? {
              ...prev,
              all_groups: allGroups,
              contact_groups: allGroups[0] ?? null,
              group_id: allGroups[0]?.id ?? null,
            }
          : prev,
      );
    },
    [],
  );

  const patch = async (body: Record<string, unknown>) => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Αποτυχία αποθήκευσης", "error");
        return;
      }
      showToast("Αποθηκεύτηκε.", "success");
      await load();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveSection = async (s: Exclude<Section, null>) => {
    if (!buf) return;
    if (s === "personal") {
      await patch({
        first_name: buf.first_name,
        last_name: buf.last_name,
        nickname: buf.nickname,
        spouse_name: buf.spouse_name,
        name_day: buf.name_day,
        birthday: buf.birthday,
        age: buf.age,
        gender: buf.gender,
        occupation: buf.occupation,
        tags: buf.tags,
        father_name: buf.father_name,
        mother_name: buf.mother_name,
        language: buf.language,
        is_dead: Boolean(buf.is_dead),
      });
    } else if (s === "electoral") {
      await patch({
        municipality: buf.municipality,
        electoral_district: buf.electoral_district,
        toponym: buf.toponym,
        political_stance: buf.political_stance,
        priority: buf.priority,
        call_status: buf.call_status,
        influence: buf.influence,
        is_volunteer: buf.is_volunteer,
        volunteer_role: buf.volunteer_role,
        volunteer_area: buf.volunteer_area,
        volunteer_since: buf.volunteer_since,
        dimotologio: buf.dimotologio,
      });
    } else if (s === "comm") {
      await patch({ phone: buf.phone, phone2: buf.phone2, landline: buf.landline, email: buf.email });
    }
  };

  const addRequest = async () => {
    if (!c || !newRequest.title.trim()) {
      showToast("Συμπληρώστε τίτλο αιτήματος.", "error");
      return;
    }
    try {
      const res = await fetchWithTimeout("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newRequest, contact_id: c.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast("Το αίτημα προστέθηκε.", "success");
      setNewRequest({
        title: "",
        description: "",
        category: "Άλλο",
        status: REQUEST_STATUS_OPEN,
        assigned_to: "",
      });
      setOpenReq(false);
      await load();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    }
  };

  const addTask = async () => {
    if (!c || !newTask.title.trim()) {
      showToast("Συμπληρώστε τίτλο εργασίας.", "error");
      return;
    }
    try {
      const res = await fetchWithTimeout("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: c.id,
          title: newTask.title.trim(),
          due_date: newTask.due_date || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα", "error");
        return;
      }
      showToast("Η εργασία προστέθηκε.", "success");
      setNewTask({ title: "", due_date: "" });
      setOpenTask(false);
      await load();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    }
  };

  const toggleTask = async (task: Task) => {
    if (!canManage) return;
    await fetchWithTimeout(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    await load();
  };

  const handleAddAddress = async () => {
    if (!id || !canEdit) return;
    try {
      const res = await fetchWithTimeout(`/api/contacts/${id}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAddress),
      });
      const data = (await res.json().catch(() => ({}))) as { address?: ContactAddressRow; error?: string };
      if (!res.ok || !data.address) {
        showToast(data.error ?? "Αποτυχία προσθήκης διεύθυνσης", "error");
        return;
      }
      setAddresses((prev) => [...prev, data.address!]);
      setShowAddAddress(false);
      setNewAddress({ type: "Οικία", odos: "", poli: "", tk: "", send_post: false });
      showToast("Η διεύθυνση προστέθηκε.", "success");
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    }
  };

  const handleAddSource = async (sourceId: string) => {
    if (!id || !canEdit || sourcesSaving) return;
    setSourcesSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        source?: ContactSourceRow;
        error?: string;
      };
      if (!res.ok || !data.source) {
        showToast(data.error ?? "Αποτυχία προσθήκης πηγής", "error");
        return;
      }
      setContactSources((prev) => {
        if (prev.some((source) => source.id === data.source!.id)) return prev;
        return [...prev, data.source!].sort((a, b) => a.name.localeCompare(b.name, "el"));
      });
      showToast("Η πηγή προστέθηκε.", "success");
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSourcesSaving(false);
    }
  };

  const handleRemoveSource = async (sourceId: string) => {
    if (!id || !canEdit || sourcesSaving) return;
    setSourcesSaving(true);
    try {
      const res = await fetchWithTimeout(
        `/api/contacts/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(data.error ?? "Αποτυχία αφαίρεσης πηγής", "error");
        return;
      }
      setContactSources((prev) => prev.filter((source) => source.id !== sourceId));
      showToast("Η πηγή αφαιρέθηκε.", "success");
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSourcesSaving(false);
    }
  };

  const handleToggleSource = async (sourceId: string) => {
    if (selectedSourceIds.includes(sourceId)) {
      await handleRemoveSource(sourceId);
      return;
    }
    await handleAddSource(sourceId);
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!id || !canEdit) return;
    if (!confirm("Να διαγραφεί η διεύθυνση;")) return;
    try {
      const res = await fetchWithTimeout(`/api/contacts/${id}/addresses`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address_id: addressId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error ?? "Αποτυχία διαγραφής", "error");
        return;
      }
      setAddresses((prev) => prev.filter((a) => a.id !== addressId));
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    }
  };

  const handleMarkContacted = async () => {
    if (!c || !id || markingContacted) return;
    setMarkingContacted(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(id)}/call-logs`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        log?: ContactCallLogItem | null;
        contact?: {
          last_contacted_at?: string | null;
          last_contacted_by?: string | null;
          call_status?: string | null;
        };
      };
      if (!res.ok) {
        showToast(j.error ?? "Αποτυχία", "error");
        return;
      }
      const lastAt = j.contact?.last_contacted_at ?? j.log?.called_at ?? new Date().toISOString();
      const lastBy = j.contact?.last_contacted_by ?? j.log?.marked_by_name ?? null;
      setContact((prev) =>
        prev
          ? {
              ...prev,
              last_contacted_at: lastAt,
              last_contacted_by: lastBy,
              call_status: j.contact?.call_status ?? prev.call_status,
            }
          : prev,
      );
      if (j.log) {
        setCallLogs([j.log as ContactCallLogItem]);
      } else {
        setCallLogs([]);
      }
      showToast("Σημειώθηκε επικοινωνία.", "success");
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setMarkingContacted(false);
    }
  };

  const handleDeleteCallLog = async (logId: string) => {
    if (!id || !canDeleteCommLogs) return;
    if (!confirm("Διαγραφή αυτής της επικοινωνίας;")) return;
    try {
      const res = await fetchWithTimeout(
        `/api/contacts/${encodeURIComponent(id)}/call-logs/${encodeURIComponent(logId)}`,
        { method: "DELETE" },
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string; last_contacted_at?: string | null };
      if (!res.ok) {
        showToast(j.error ?? "Αποτυχία διαγραφής", "error");
        return;
      }
      setCallLogs([]);
      setContact((prev) =>
        prev ? { ...prev, last_contacted_at: j.last_contacted_at ?? null, last_contacted_by: null } : prev,
      );
      showToast("Η καταγραφή διαγράφηκε.", "success");
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    }
  };

  const triggerCall = async () => {
    if (!c) return;
    await fetchWithTimeout("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: c.id }),
    });
  };

  const saveCallerStatus = async () => {
    if (!c) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_status: c.call_status }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Αποτυχία", "error");
        return;
      }
      showToast("Η κατάσταση κλήσης ενημερώθηκε.", "success");
      await load();
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!id) {
    return <p className="text-sm text-[var(--text-secondary)]">Μη έγκυρο ID.</p>;
  }

  if (!c) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-[var(--text-secondary)]">Φόρτωση επαφής…</p>
      </div>
    );
  }

  const st = c.call_status ?? "Pending";
  const pr = c.priority ?? "Medium";
  const primaryGreek = greekHeaderPrimaryLine(c.last_name, c.first_name, c.father_name);
  const motherGreek = greekHeaderMotherLine(c.mother_name);
  const nameHeadParts = primaryGreek.split(" του ");
  const headNameLine = nameHeadParts[0]?.trim() || primaryGreek;
  const headPatronym = nameHeadParts[1]?.trim();
  const initials = `${(c.first_name?.[0] ?? "?").toUpperCase()}${(c.last_name?.[0] ?? "?").toUpperCase()}`;
  const live = w ?? c;
  const onomaTeponymo = [live.first_name, live.last_name].filter(Boolean).join(" ").trim();

  const copyHeaderInfo = async () => {
    try {
      await navigator.clipboard.writeText(buildContactCopyText(c));
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn(focusMode && "fixed inset-0 z-[200] bg-background overflow-y-auto")}>
      {focusMode && c ? (
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#003476] to-[#0a1f3a] text-xs font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{headNameLine}</p>
              {c.contact_code ? (
                <p className="truncate font-mono text-xs text-muted-foreground">{c.contact_code}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">ESC για έξοδο</span>
            <button
              type="button"
              onClick={() => handleSetFocusMode(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted"
              aria-label="Έξοδος από λειτουργία εστίασης"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      <div className={cn(focusMode && "max-w-6xl mx-auto px-6 py-4")}>
    <div className="min-h-full -m-6 overflow-x-hidden bg-[var(--bg-primary)] p-4 pb-20 text-[var(--text-primary)] sm:p-6 md:-m-8 md:p-8 md:pb-8">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.push(focusMode ? "/contacts?focus=1" : "/contacts")}
          className={lux.btnSecondary + " inline-flex shrink-0 items-center gap-1.5 !py-1.5 text-xs sm:gap-2 sm:!py-2 sm:text-sm"}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Επαφές
        </button>
        {navInfo ? (
          <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => navInfo.prev && router.push(contactDetailHref(navInfo.prev))}
              disabled={!navInfo.prev}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40 sm:gap-1 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
              <span className="sm:inline">Προηγούμενο</span>
            </button>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--text-muted)] sm:text-xs">
              {navInfo.position} / {navInfo.total}
            </span>
            <button
              type="button"
              onClick={() => navInfo.next && router.push(contactDetailHref(navInfo.next))}
              disabled={!navInfo.next}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40 sm:gap-1 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              <span className="sm:inline">Επόμενο</span>
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
      {isCaller && (
        <p className="mb-4 rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
          Προβολή — μπορείτε να αλλάξετε μόνο την <strong>κατάσταση κλήσης</strong>· αποθήκευση παρακάτω.
        </p>
      )}

      {/* Header — full-width hero */}
      <div
        className="relative mb-6 max-md:sticky max-md:top-0 z-20 max-md:backdrop-blur-sm overflow-hidden rounded-2xl border border-[var(--border)] p-4 shadow-[var(--card-shadow)] sm:p-6"
        style={{
          background: `linear-gradient(128deg, var(--bg-secondary) 0%, var(--bg-card) 42%, color-mix(in srgb, var(--bg-elevated) 75%, var(--bg-card) 25%) 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-16 h-48 w-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent-gold)_14%,transparent),transparent)] opacity-80"
          aria-hidden
        />
        <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-48 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent-blue)_12%,transparent),transparent)] opacity-70" aria-hidden />
        <div className="relative flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between lg:items-center">
          <button
            type="button"
            onClick={() => handleSetFocusMode(!focusMode)}
            title={focusMode ? "Έξοδος εστίασης (ESC)" : "Λειτουργία εστίασης"}
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted md:hidden"
            aria-label={focusMode ? "Έξοδος από λειτουργία εστίασης" : "Λειτουργία εστίασης"}
          >
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <div className="flex min-w-0 flex-col gap-3 pr-11 md:pr-0">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#003476] to-[#0a1f3a] text-base font-bold text-white shadow-lg ring-2 ring-[var(--accent-gold)] ring-offset-2 ring-offset-[var(--bg-card)] sm:h-16 sm:w-16 sm:text-lg">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-balance text-xl font-bold leading-tight text-[var(--text-card-title)] sm:text-2xl" style={{ lineHeight: 1.2 }}>
                  {headNameLine}
                </h1>
                {headPatronym ? <p className="mt-1 text-sm italic text-[var(--accent-gold)] sm:mt-1.5 sm:text-base">του {headPatronym}</p> : null}
                {motherGreek ? <p className="mt-0.5 text-xs text-[var(--text-muted)] sm:mt-1 sm:text-sm">{motherGreek}</p> : null}
              </div>
            </div>
            <ContactStatusBadges contact={c} />
            <div
              className="h-0.5 w-14 rounded-full bg-gradient-to-r from-[var(--accent-gold)] to-transparent"
              aria-hidden
            />
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className={
                  "inline-flex min-h-7 max-w-full items-center rounded-md px-2.5 py-0.5 text-[11px] font-semibold " +
                  (callStatusPill[st] ?? callStatusPill.Pending)
                }
              >
                {callStatusLabel(c.call_status)}
              </span>
              <span
                className={
                  "inline-flex min-h-7 items-center rounded-md px-2.5 py-0.5 text-[11px] font-semibold " +
                  (priorityPill[pr] ?? priorityPill.Medium)
                }
              >
                {pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
              </span>
              {c.contact_code ? (
                <span className="inline-flex min-h-7 max-w-full items-center rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                  {c.contact_code}
                </span>
              ) : null}
              {((c as Contact).language ?? "el") !== "el" ? (
                <span className="inline-flex min-h-7 items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                  {(c as Contact).language}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 font-mono text-sm text-[var(--text-secondary)]">
                <span>{disp(c.phone)}</span>
                {c.phone2?.trim() ? <span className="text-xs text-[var(--text-muted)]">· {c.phone2}</span> : null}
                {c.landline?.trim() ? <span className="text-xs text-[var(--text-muted)]">· στ. {c.landline}</span> : null}
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 md:hidden">
                {c.phone?.trim() ? (
                  <a
                    href={`tel:${c.phone.replace(/\s/g, "")}`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/50"
                    title="Κλήση"
                    aria-label="Κλήση τηλεφώνου"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                ) : null}
                {!isCaller ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void triggerCall()}
                      className="inline-flex min-h-[44px] w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-2.5 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/50"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      Retell
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyHeaderInfo()}
                      className="inline-flex min-h-[44px] w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-2.5 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/50"
                    >
                      <Clipboard className="h-3.5 w-3.5 shrink-0" />
                      {headerCopied ? "Αντιγράφηκε" : "Αντιγραφή"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {!isCaller ? (
              <p className="text-[10px] leading-snug text-[var(--text-muted)] md:hidden">Retell: εξερχόμενη κλήση</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 md:hidden">
                <HqSelect
                  aria-label="Κατάσταση κλήσης"
                  wrapperClassName="inline-block w-auto max-w-full min-w-0 flex-1"
                  className={inputSm + " !pr-9 w-full min-w-[120px] max-w-full"}
                  value={c.call_status ?? "Pending"}
                  onChange={(e) => setContact({ ...c, call_status: e.target.value })}
                >
                  {CALL_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </HqSelect>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveCallerStatus()}
                  className="inline-flex min-h-[44px] w-auto shrink-0 items-center justify-center rounded-lg bg-[#003476] px-3 text-xs font-semibold text-white hover:bg-[#002255] disabled:opacity-50"
                >
                  Αποθήκευση
                </button>
                <button
                  type="button"
                  onClick={() => void copyHeaderInfo()}
                  className="inline-flex min-h-[44px] w-auto shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-2.5 text-xs font-semibold text-[var(--text-primary)]"
                >
                  <Clipboard className="h-3.5 w-3.5 shrink-0" />
                  {headerCopied ? "Αντιγράφηκε" : "Αντιγραφή"}
                </button>
              </div>
            )}
            {!isCaller ? (
              <div className="flex flex-wrap items-center gap-1.5 md:hidden">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => startEdit("personal")}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/50"
                    title="Επεξεργασία"
                    aria-label="Επεξεργασία"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                ) : null}
                <Link
                  href="/alexandra"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--accent-gold)]/35 bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] text-[var(--accent-gold)] transition hover:brightness-110"
                  title="Αλεξάνδρα"
                  aria-label="Ανοιχτό Αλεξάνδρα"
                >
                  <Sparkles className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>

          <div className="hidden w-full min-w-0 flex-col items-stretch gap-2 sm:max-w-[min(100%,380px)] md:flex lg:items-end">
            {isCaller ? (
              <div className="flex w-full flex-wrap items-center justify-end gap-2">
                <span
                  className={
                    "inline-flex rounded-md px-2.5 py-0.5 text-xs font-semibold " +
                    (priorityPill[pr] ?? priorityPill.Medium)
                  }
                >
                  {pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
                </span>
                <HqSelect
                  aria-label="Κατάσταση κλήσης"
                  wrapperClassName="inline-block w-auto max-w-full"
                  className={inputSm + " !pr-9 w-auto min-w-[140px] max-w-full"}
                  value={c.call_status ?? "Pending"}
                  onChange={(e) => setContact({ ...c, call_status: e.target.value })}
                >
                  {CALL_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </HqSelect>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveCallerStatus()}
                  className="h-9 rounded-lg bg-[#003476] px-3 text-xs font-semibold text-white hover:bg-[#002255] disabled:opacity-50"
                >
                  Αποθήκευση
                </button>
                <button
                  type="button"
                  onClick={() => void copyHeaderInfo()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 text-xs font-semibold text-[var(--text-primary)]"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {headerCopied ? "Αντιγράφηκε" : "Αντιγραφή"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetFocusMode(!focusMode)}
                  title={focusMode ? "Έξοδος εστίασης (ESC)" : "Λειτουργία εστίασης"}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted"
                >
                  {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            ) : (
              <div className="flex w-full flex-wrap items-center justify-end gap-2">
                {c.phone?.trim() ? (
                  <a
                    href={`tel:${c.phone.replace(/\s/g, "")}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/90 text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/50"
                    title="Κλήση"
                    aria-label="Κλήση τηλεφώνου"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                ) : null}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => startEdit("personal")}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/90 text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/50"
                    title="Επεξεργασία"
                    aria-label="Επεξεργασία"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <Link
                  href="/alexandra"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--accent-gold)]/35 bg-[color-mix(in_srgb,var(--accent-gold)_12%,transparent)] text-[var(--accent-gold)] transition hover:brightness-110"
                  title="Αλεξάνδρα"
                  aria-label="Ανοιχτό Αλεξάνδρα"
                >
                  <Sparkles className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => void triggerCall()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent-gold)]/50"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Retell
                </button>
                <button
                  type="button"
                  onClick={() => void copyHeaderInfo()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/90 px-3 text-xs font-semibold text-[var(--text-primary)]"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {headerCopied ? "Αντιγράφηκε" : "Αντιγραφή"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetFocusMode(!focusMode)}
                  title={focusMode ? "Έξοδος εστίασης (ESC)" : "Λειτουργία εστίασης"}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted"
                >
                  {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <p className="w-full text-right text-[10px] text-[var(--text-muted)]">Retell: εξερχόμενη κλήση (Outbound)</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-5">
        {canManage && (
          <div className="min-w-0 md:col-span-2">
            <AISummaryCard
              entityType="contact"
              entityId={c.id}
              entityName={`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}
              apiEndpoint={`/api/contacts/${c.id}/ai-summary`}
              compact
            />
          </div>
        )}
        {canManage && (
          <div className="min-w-0 md:col-span-2">
            <ContactExtraSections contactId={c.id} phone={c.phone} canManage={canManage} />
          </div>
        )}
        {canManage && (
          <div className="min-w-0 md:col-span-2">
            <ContactRelatedPersonsSection contactId={c.id} canManage={canManage} />
          </div>
        )}
          <div className="flex min-w-0 flex-col gap-5 overflow-visible">
            {/* A Personal */}
            <div
              {...animDelay(0)}
              className={[cardGold, canEdit && editing === "personal" && mobileEditOverlay].filter(Boolean).join(" ")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <User className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                  <h2 className={cardTitle + " m-0 flex-1 !mb-0 border-0 p-0"}>Προσωπικά στοιχεία</h2>
                </div>
                {canEdit && editing !== "personal" && (
                  <button type="button" onClick={() => startEdit("personal")} className={btnEdit}>
                    Επεξεργασία
                  </button>
                )}
                {canEdit && editing === "personal" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveSection("personal").then(cancelEdit)}
                      className="text-xs font-semibold text-[#16A34A] hover:underline"
                    >
                      Αποθήκευση
                    </button>
                    <button type="button" onClick={cancelEdit} className="text-xs text-[var(--text-secondary)] hover:underline">
                      Ακύρωση
                    </button>
                  </div>
                )}
              </div>
              <div className={grid2} style={{ gap: "0.5rem" }}>
                {(
                  [
                    { k: "nickname" as const, l: "Υποκοριστικό" },
                    { k: "first_name" as const, l: "Μικρό Όνομα" },
                    { k: "last_name" as const, l: "Επίθετο" },
                    { k: "father_name" as const, l: "Πατρώνυμο" },
                    { k: "mother_name" as const, l: "Μητρώνυμο" },
                    { k: "spouse_name" as const, l: "Όνομα Συζύγου" },
                    { k: "name_day" as const, l: "Γιορτή", date: true },
                    { k: "gender" as const, l: "Φύλο" },
                    { k: "occupation" as const, l: "Επάγγελμα" },
                  ] as const
                ).map((row) => {
                  const isDate = "date" in row && row.date;
                  const isNum = "num" in row && row.num;
                  const inEdit = canEdit && editing === "personal" && w;
                  const raw = c?.[row.k];
                  const displayVal = isNum
                    ? c?.age != null
                      ? String(c.age)
                      : "—"
                    : isDate
                      ? formatCalendarDateOnly(raw as string | null)
                      : disp(raw as string | null);
                  return (
                  <div key={row.k} className="sm:col-span-1">
                    {inEdit ? (
                      <div className={fieldGap}>
                        <span className={lbl}>{row.l}</span>
                        {isDate ? (
                        <input
                          className={inputSm}
                          type="date"
                          value={((w![row.k] as string) ?? "").slice(0, 10)}
                          onChange={(e) =>
                            setBuf({ ...w!, [row.k]: e.target.value || null } as Contact)
                          }
                        />
                      ) : isNum ? (
                        <input
                          className={inputSm}
                          type="number"
                          value={w!.age != null ? String(w!.age) : ""}
                          onChange={(e) =>
                            setBuf({ ...w!, age: e.target.value ? Number(e.target.value) : null })
                          }
                        />
                      ) : (
                        <input
                          className={inputSm}
                          value={String((w as unknown as Record<string, string | null>)[row.k] ?? "")}
                          onChange={(e) =>
                            setBuf({ ...w!, [row.k]: e.target.value || null } as Contact)
                          }
                        />
                      )}
                      </div>
                    ) : (
                      <ProfileField icon={<User className="h-4 w-4 opacity-90" />} label={row.l} value={displayVal} />
                    )}
                  </div>
                );
                })}
                <div className="sm:col-span-2">
                  {canEdit && editing === "personal" && w ? (
                    <div className={fieldGap}>
                      <span className={lbl}>Γενέθλια</span>
                      <input
                        className={inputSm}
                        type="date"
                        value={((w.birthday as string) ?? "").slice(0, 10)}
                        onChange={(e) =>
                          setBuf({ ...w, birthday: e.target.value || null } as Contact)
                        }
                      />
                      <span className={lbl}>Ηλικία (χειροκίνητη, αν δεν υπάρχουν γενέθλια)</span>
                      <input
                        className={inputSm}
                        type="number"
                        value={w.age != null ? String(w.age) : ""}
                        onChange={(e) =>
                          setBuf({ ...w, age: e.target.value ? Number(e.target.value) : null })
                        }
                      />
                    </div>
                  ) : (
                    (() => {
                      const realAge = getAgeFromBirthday(c.birthday) ?? c.age;
                      const daysUntil = getDaysUntilBirthday(c.birthday);
                      const isToday = daysUntil === 0;
                      const isSoon = daysUntil !== null && daysUntil <= 7 && daysUntil > 0;
                      const birthDate = c.birthday
                        ? formatCalendarDateOnly(c.birthday, {
                            day: "numeric",
                            month: "long",
                          })
                        : null;
                      return (
                        <div className="flex items-start gap-2.5 py-2.5">
                          <Cake className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                          <div className="min-w-0 flex flex-col gap-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                              Γενέθλια
                            </p>
                            <span className="text-sm text-[var(--text-primary)]">
                              {birthDate ?? "Άγνωστα γενέθλια"}
                              {realAge !== null && (
                                <span className="ml-1.5 text-[var(--text-muted)]">({realAge} ετών)</span>
                              )}
                            </span>
                            {isToday && (
                              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--accent-gold)]">
                                <Gift className="h-3 w-3 shrink-0" aria-hidden />
                                Σήμερα είναι τα γενέθλιά του/της!
                              </span>
                            )}
                            {isSoon && !isToday && (
                              <span className="flex items-center gap-1 text-xs text-[var(--warning)]">
                                <Bell className="h-3 w-3 shrink-0" aria-hidden />
                                Γενέθλια σε {daysUntil} μέρες
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
                <div className="sm:col-span-2">
                  <div className={fieldGap}>
                    <span className={lbl}>Ετικέτες</span>
                    {canEdit && editing === "personal" && w ? (
                      <input
                        className={inputSm}
                        value={Array.isArray(w.tags) ? w.tags.join(", ") : ""}
                        onChange={(e) =>
                          setBuf({
                            ...w,
                            tags: e.target.value
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    ) : (
                      <p className={val}>
                        {Array.isArray(c.tags) && c.tags.length ? c.tags.join(", ") : "—"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className={fieldGap}>
                    <span className={lbl}>Γλώσσα</span>
                    {canEdit && editing === "personal" && w ? (
                      <input
                        className={inputSm}
                        placeholder="el, en, de…"
                        value={String((w as Contact).language ?? "el")}
                        onChange={(e) => setBuf({ ...w, language: e.target.value || "el" } as Contact)}
                      />
                    ) : (
                      <p className={val}>
                        {((c as Contact).language ?? "el") === "el" ? "Ελληνικά" : (c as Contact).language}
                      </p>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className={fieldGap}>
                    <span className={lbl}>Απεβίωσε</span>
                    {canEdit && editing === "personal" && w ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[var(--border)] accent-[#003476]"
                          checked={Boolean(w.is_dead)}
                          onChange={(e) => setBuf({ ...w, is_dead: e.target.checked })}
                        />
                        Σημείωση απεβίωσης
                      </label>
                    ) : (
                      <p className={val}>{c.is_dead ? "Ναι" : "Όχι"}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div {...animDelay(1)}>
              <ContactGroupsSection
                contactId={c.id}
                groups={c.all_groups ?? []}
                groupOptions={groupOptions}
                canManage={canEdit}
                onGroupsChange={handleGroupsChange}
                onToast={showToast}
              />
            </div>

            {/* B Electoral */}
            <div
              {...animDelay(2)}
              className={cn(
                cardBlue,
                "relative min-w-0 w-full",
                canEdit && editing === "electoral" && mobileEditOverlay,
                canEdit && editing === "electoral" && "h-auto overflow-visible pb-6",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-[var(--accent-blue)]" aria-hidden />
                  <h2 className={cardTitle + " m-0 border-0 p-0 !mb-0 text-[var(--accent-blue-bright)]"}>Εκλογική πληροφόρηση</h2>
                </div>
                {canEdit && editing !== "electoral" && (
                  <button type="button" onClick={() => startEdit("electoral")} className={btnEdit}>
                    Επεξεργασία
                  </button>
                )}
                {canEdit && editing === "electoral" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveSection("electoral").then(cancelEdit)}
                      className="text-xs font-semibold text-[#16A34A] hover:underline"
                    >
                      Αποθήκευση
                    </button>
                    <button type="button" onClick={cancelEdit} className="text-xs text-[var(--text-secondary)]">
                      Ακύρωση
                    </button>
                  </div>
                )}
              </div>
              <div
                className={cn(
                  grid2,
                  "min-w-0 w-full gap-y-3",
                  canEdit && editing === "electoral" && w && "gap-y-4",
                )}
              >
                {canEdit && editing === "electoral" && w ? (
                  <div className="min-w-0 sm:col-span-2">
                    <ContactElectoralLocationEdit
                      values={{
                        municipality: w.municipality,
                        electoral_district: w.electoral_district,
                        toponym: w.toponym,
                      }}
                      onChange={(v) =>
                        setBuf({
                          ...w,
                          municipality: v.municipality,
                          electoral_district: v.electoral_district,
                          toponym: v.toponym,
                        } as Contact)
                      }
                      inputClassName={inputSm + " !pr-9"}
                      labelClassName={lbl}
                    />
                  </div>
                ) : null}
                {!(canEdit && editing === "electoral" && w)
                  ? (["municipality", "electoral_district", "toponym"] as const).map((k) => {
                      const labels: Record<typeof k, string> = {
                        municipality: "Δήμος",
                        electoral_district: "Εκλογικό διαμέρισμα",
                        toponym: "Τοπωνύμιο/χωριό",
                      };
                      return (
                        <div key={k} className={fieldGap}>
                          <span className={lbl}>{labels[k]}</span>
                          <p className={val}>{disp(c?.[k] as string | null)}</p>
                        </div>
                      );
                    })
                  : null}
                <div className={fieldGap + " sm:col-span-2"}>
                  <span className={lbl}>Δημοτολόγιο</span>
                  {canEdit && editing === "electoral" && w ? (
                    <input
                      type="text"
                      className={inputSm}
                      placeholder="Αριθμός δημοτολογίου…"
                      value={String(w.dimotologio ?? "")}
                      onChange={(e) => setBuf({ ...w, dimotologio: e.target.value || null } as Contact)}
                    />
                  ) : (
                    <p className={val}>{disp(c.dimotologio)}</p>
                  )}
                </div>
                {(
                  [
                    { k: "political_stance" as const, l: "Πολιτική τοποθέτηση" },
                  ] as const
                ).map((row) => (
                  <div key={row.k} className={fieldGap}>
                    <span className={lbl}>{row.l}</span>
                    {canEdit && editing === "electoral" && w ? (
                      <input
                        type="text"
                        className={
                          inputSm +
                          " w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        }
                        value={String((w as Record<string, unknown>)[row.k] ?? "")}
                        onChange={(e) =>
                          setBuf({ ...w, [row.k]: e.target.value || null } as Contact)
                        }
                      />
                    ) : (
                      <p className={val}>{disp(c?.[row.k] as string | null)}</p>
                    )}
                  </div>
                ))}
                <div className={fieldGap}>
                  <span className={lbl}>Προτεραιότητα</span>
                  {canEdit && editing === "electoral" && w ? (
                    <HqSelect className={inputSm + " !pr-9"} value={w.priority ?? "Medium"} onChange={(e) => setBuf({ ...w, priority: e.target.value })}>
                      <option value="High">Υψηλή</option>
                      <option value="Medium">Μεσαία</option>
                      <option value="Low">Χαμηλή</option>
                    </HqSelect>
                  ) : (
                    <p className={val}>{pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}</p>
                  )}
                </div>
                <div className={fieldGap}>
                  <span className={lbl}>Κατάσταση κλήσης</span>
                  {canEdit && editing === "electoral" && w ? (
                    <SearchableSelect
                      className={inputSm + " !pr-9"}
                      value={w.call_status ?? "Pending"}
                      onChange={(v) => setBuf({ ...w, call_status: v })}
                      options={callStatusSearchOptions}
                      placeholder="Κατάσταση κλήσης"
                    />
                  ) : (
                    <p className={val}>{callStatusLabel(c.call_status)}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2">
                    {canEdit && editing === "electoral" && w ? (
                      <>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[var(--border)]"
                          checked={Boolean(w.influence)}
                          onChange={(e) => setBuf({ ...w, influence: e.target.checked })}
                        />
                        <span className="text-sm">Επαφή επιρροής</span>
                      </>
                    ) : (
                      <span className="text-sm text-[var(--text-primary)]">
                        Επαφή επιρροής: {c.influence ? "Ναι" : "Όχι"}
                      </span>
                    )}
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <span className={lbl + " mb-1 block"}>Εθελοντική συμμετοχή</span>
                  {canEdit && editing === "electoral" && w ? (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded"
                          checked={Boolean((w as Contact).is_volunteer)}
                          onChange={(e) => setBuf({ ...w, is_volunteer: e.target.checked } as Contact)}
                        />
                        Εθελοντής
                      </label>
                      <input
                        className={inputSm}
                        placeholder="Ρόλος (π.χ. πεζοπορία)"
                        value={String((w as Contact).volunteer_role ?? "")}
                        onChange={(e) => setBuf({ ...w, volunteer_role: e.target.value || null } as Contact)}
                      />
                      <input
                        className={inputSm}
                        type="date"
                        value={((w as Contact).volunteer_since ?? "").toString().slice(0, 10)}
                        onChange={(e) => setBuf({ ...w, volunteer_since: e.target.value || null } as Contact)}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-primary)]">
                      {(c as Contact).is_volunteer ? "Ναι" : "Όχι"}
                      {((c as Contact).volunteer_role ?? "") ? ` · Ρόλος: ${(c as Contact).volunteer_role}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Contact sources — separate card below electoral info */}
            <div
              {...animDelay(3)}
              className={cn(card, "relative z-[1] min-w-0 w-full shrink-0 overflow-visible")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                  Πηγές
                </h2>
                {sourcesLoading ? (
                  <span className="text-xs text-[var(--text-muted)]">Φόρτωση...</span>
                ) : null}
              </div>

              {contactSources.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {contactSources.map((source) =>
                    canEdit ? (
                      <button
                        key={source.id}
                        type="button"
                        disabled={sourcesSaving}
                        onClick={() => void handleRemoveSource(source.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/10 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-gold)]/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span>{source.name}</span>
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    ) : (
                      <span
                        key={source.id}
                        className="inline-flex items-center rounded-full border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/10 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                      >
                        {source.name}
                      </span>
                    ),
                  )}
                </div>
              ) : (
                <p className="mb-3 text-sm text-[var(--text-muted)]">
                  {sourcesLoading ? "Φόρτωση πηγών..." : "Δεν έχουν οριστεί πηγές."}
                </p>
              )}

              {canEdit ? (
                <div className="space-y-2">
                  <span className={lbl}>Προσθήκη / αφαίρεση</span>
                  <SearchableMultiSelect
                    className={inputSm + " !pr-9"}
                    values={selectedSourceIds}
                    onToggle={(sourceId) => void handleToggleSource(sourceId)}
                    options={sourceOptions}
                    placeholder={
                      sourceOptions.length > 0 ? "Επιλέξτε πηγές" : "Δεν υπάρχουν διαθέσιμες πηγές"
                    }
                    searchPlaceholder="Αναζήτηση πηγής..."
                    emptyText="Δεν βρέθηκαν πηγές"
                    disabled={sourcesLoading || sourcesSaving || sourceOptions.length === 0}
                    aria-label="Επιλογή πηγών"
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    Επιλέξτε μία πηγή για προσθήκη ή ξαναπατήστε την για αφαίρεση.
                  </p>
                </div>
              ) : null}
            </div>

            <div {...animDelay(4)} className={cn(card, "relative min-w-0 w-full overflow-visible")}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <MapPin className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                  Διευθύνσεις
                </h2>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(true)}
                    className={"inline-flex items-center gap-1 " + lux.linkAction}
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    Προσθήκη
                  </button>
                ) : null}
              </div>
              {addresses.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Δεν υπάρχουν διευθύνσεις.</p>
              ) : (
                <ul className="space-y-0">
                  {addresses.map((addr) => (
                    <li
                      key={addr.id}
                      className="flex items-start gap-3 border-b border-[var(--border)]/50 py-2.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase text-[var(--accent)]">{addr.type}</span>
                          {addr.send_post ? (
                            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                              Αποστέλλεται αλληλογραφία
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-[var(--text-primary)]">{addr.odos?.trim() || "—"}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {[addr.poli, addr.tk].filter(Boolean).join(" ") || "—"}
                        </p>
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteAddress(addr.id)}
                          className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-500/10"
                          aria-label="Διαγραφή διεύθυνσης"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && showAddAddress ? (
                <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                  <HqSelect
                    className={inputSm + " !pr-9"}
                    value={newAddress.type}
                    onChange={(e) => setNewAddress((p) => ({ ...p, type: e.target.value }))}
                  >
                    <option value="Οικία">Οικία</option>
                    <option value="Εργασία">Εργασία</option>
                    <option value="Άλλο">Άλλο</option>
                  </HqSelect>
                  <input
                    placeholder="Οδός"
                    value={newAddress.odos}
                    onChange={(e) => setNewAddress((p) => ({ ...p, odos: e.target.value }))}
                    className={inputSm}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      placeholder="Πόλη"
                      value={newAddress.poli}
                      onChange={(e) => setNewAddress((p) => ({ ...p, poli: e.target.value }))}
                      className={inputSm}
                    />
                    <input
                      placeholder="Τ.Κ."
                      value={newAddress.tk}
                      onChange={(e) => setNewAddress((p) => ({ ...p, tk: e.target.value }))}
                      className={inputSm}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)]"
                      checked={newAddress.send_post}
                      onChange={(e) => setNewAddress((p) => ({ ...p, send_post: e.target.checked }))}
                    />
                    Αποστέλλεται αλληλογραφία
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddAddress(false)}
                      className="flex-1 rounded-xl border border-[var(--border)] py-2 text-sm"
                    >
                      Άκυρο
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddAddress()}
                      className="flex-1 rounded-xl bg-[#003476] py-2 text-sm font-semibold text-white"
                    >
                      Αποθήκευση
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {canManage && (
              <div {...animDelay(1)} className={card + " !p-0"}>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-2 rounded-[12px] p-4 text-left text-sm font-semibold text-[var(--text-primary)]"
                >
                  Ιστορικό αλλαγών
                  <span className="text-xs text-[var(--text-muted)]">{historyOpen ? "▲" : "▼"}</span>
                </button>
                {historyOpen && (
                  <div className="max-h-80 space-y-2 overflow-y-auto border-t border-[var(--border)]/50 px-4 py-3">
                    {historyLoading && <p className="text-xs text-[var(--text-muted)]">Φόρτωση…</p>}
                    {!historyLoading &&
                      historyRows.length === 0 && (
                        <p className="text-xs text-[var(--text-muted)]">Καμία καταχωρισμένη αλλαγή.</p>
                      )}
                    {!historyLoading &&
                      historyRows.map((h) => {
                        const ch = h.details?.changed_fields as
                          | Record<string, { from: unknown; to: unknown }>
                          | undefined;
                        return (
                          <div
                            key={h.id}
                            className="rounded border border-[var(--border)]/50 bg-[var(--bg-elevated)]/30 p-2 text-xs text-[var(--text-secondary)]"
                          >
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {formatDateTimeAthens(h.created_at, { hour12: false })} — {h.user_name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[var(--text-primary)]/90">
                              {h.action} · {h.entity_type} · {h.entity_name ?? "—"}
                            </p>
                            {ch && Object.keys(ch).length > 0 && (
                              <ul className="mt-1 list-inside list-disc text-[10px] text-[var(--text-muted)]">
                                {Object.entries(ch).map(([k, v]) => (
                                  <li key={k}>
                                    <span className="font-mono">{k}</span>: {JSON.stringify(v.from)} → {JSON.stringify(v.to)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* D Notes (timeline) */}
            <div {...animDelay(2)} className={cardGold}>
              <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Σημειώσεις</h2>
              {(c.notes?.trim() ?? "") !== "" && (
                <div
                  className="mb-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/50 p-3 text-xs text-[var(--text-secondary)]"
                  role="note"
                >
                  <span className="font-medium text-[var(--text-muted)]">Παλιά σημείωση: </span>
                  <span className="whitespace-pre-wrap">{c.notes}</span>
                </div>
              )}
              <ul className="mb-4 max-h-[min(50vh,420px)] space-y-2.5 overflow-y-auto pr-1">
                {contactNotes.length === 0 && (c.notes?.trim() ?? "") === "" ? (
                  <li className="text-xs text-[var(--text-muted)]">Καμία σημείωση ακόμα.</li>
                ) : null}
                {contactNotes.length === 0 && (c.notes?.trim() ?? "") !== "" && (
                  <li className="text-xs text-[var(--text-muted)]">Χωρίς νέες σημειώσεις.</li>
                )}
                {contactNotes.map((note) => {
                  const canDeleteThis =
                    Boolean(profile?.id) &&
                    (note.user_id === profile?.id || profile?.role === "admin");
                  return (
                    <li key={note.id}>
                      <div className="group relative rounded-md border border-[var(--border)] border-l-[3px] border-l-[var(--accent-gold)] bg-[var(--bg-elevated)]/35 p-3 pl-3 pr-2">
                        {canDeleteThis && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!id) return;
                              const dres = await fetchWithTimeout(
                                `/api/contacts/${id}/notes/${note.id}`,
                                { method: "DELETE" },
                              );
                              if (dres.ok) {
                                setContactNotes((prev) => prev.filter((x) => x.id !== note.id));
                              }
                            }}
                            className="absolute right-1.5 top-1.5 z-[1] inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--bg-card)] hover:text-red-400 group-hover:opacity-100"
                            title="Διαγραφή"
                            aria-label="Διαγραφή σημείωσης"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className="flex gap-3 pr-5">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[11px] font-bold text-[var(--text-primary)]"
                            aria-hidden
                          >
                            {authorInitials(note.author_name?.trim() || note.author_full_name || "—")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{note.content}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {note.author_name && (
                                <span className="text-xs font-medium text-primary/70">{note.author_name}</span>
                              )}
                              {note.author_name && <span className="text-xs text-muted-foreground">·</span>}
                              <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {canEdit && (
                <div className="mt-1 flex flex-col gap-2">
                  <textarea
                    className="min-h-[80px] w-full resize-y rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)]/20"
                    placeholder="Νέα σημείωση…"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    disabled={noteSending}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={noteSending || !noteDraft.trim()}
                      onClick={async () => {
                        if (!id || !noteDraft.trim()) return;
                        setNoteSending(true);
                        try {
                          const res = await fetchWithTimeout(`/api/contacts/${id}/notes`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ content: noteDraft.trim() }),
                          });
                          if (res.ok) {
                            const j = (await res.json()) as { note?: ContactNoteItem };
                            if (j.note) {
                              setContactNotes((prev) => [j.note as ContactNoteItem, ...prev]);
                            }
                            setNoteDraft("");
                            void load();
                          }
                        } finally {
                          setNoteSending(false);
                        }
                      }}
                      className="inline-flex min-h-9 min-w-[100px] items-center justify-center rounded-lg bg-[#003476] px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {noteSending ? "…" : "Αποστολή"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {canEdit && (
              <div {...animDelay(3)} className={card}>
                <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Υποστήριξη / δωρεές</h2>
                <ul className="mb-3 space-y-2 text-sm">
                  {supporters.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2"
                    >
                      <span>
                        {s.support_type ?? "—"}{" "}
                        {s.amount != null ? <strong>{Number(s.amount).toFixed(2)} €</strong> : null}
                        {s.date ? <span className="text-xs text-[var(--text-muted)]"> · {s.date}</span> : null}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:underline"
                        onClick={async () => {
                          await fetchWithTimeout(`/api/contacts/${id}/supporters?id=${s.id}`, { method: "DELETE" });
                          await load();
                        }}
                      >
                        Αφαίρεση
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <HqSelect className={inputSm + " !pr-9"} value={newSup.support_type} onChange={(e) => setNewSup((x) => ({ ...x, support_type: e.target.value }))}>
                    {["Οικονομική", "Εθελοντισμός", "Προπαγάνδα", "Άλλο"].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </HqSelect>
                  <input
                    className={inputSm}
                    type="number"
                    step="0.01"
                    placeholder="Ποσό (€)"
                    value={newSup.amount}
                    onChange={(e) => setNewSup((x) => ({ ...x, amount: e.target.value }))}
                  />
                  <input
                    className={inputSm}
                    type="date"
                    value={newSup.date}
                    onChange={(e) => setNewSup((x) => ({ ...x, date: e.target.value }))}
                  />
                  <input
                    className={inputSm}
                    placeholder="Σημειώσεις"
                    value={newSup.notes}
                    onChange={(e) => setNewSup((x) => ({ ...x, notes: e.target.value }))}
                  />
                </div>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[#16A34A] hover:underline"
                  onClick={async () => {
                    if (!c) return;
                    await fetchWithTimeout(`/api/contacts/${c.id}/supporters`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        support_type: newSup.support_type,
                        amount: newSup.amount ? Number(newSup.amount) : null,
                        date: newSup.date || null,
                        notes: newSup.notes || null,
                      }),
                    });
                    setNewSup({ support_type: "Οικονομική", amount: "", date: "", notes: "" });
                    await load();
                  }}
                >
                  Προσθήκη
                </button>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {/* C Comm — right column, above αιτήματα */}
            <div
              {...animDelay(4)}
              className={[cardGreen, canEdit && editing === "comm" && mobileEditOverlay].filter(Boolean).join(" ")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden />
                  <h2 className={cardTitle + " m-0 !mb-0 border-0 p-0 text-[#34d399]"}>Επικοινωνία</h2>
                </div>
                {canEdit && editing !== "comm" && (
                  <button type="button" onClick={() => startEdit("comm")} className={btnEdit}>
                    Επεξεργασία
                  </button>
                )}
                {canEdit && editing === "comm" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveSection("comm").then(cancelEdit)}
                      className="text-xs font-semibold text-[#16A34A] hover:underline"
                    >
                      Αποθήκευση
                    </button>
                    <button type="button" onClick={cancelEdit} className="text-xs text-[var(--text-secondary)]">
                      Ακύρωση
                    </button>
                  </div>
                )}
              </div>
              <div className={grid2} style={{ gap: "0.5rem" }}>
                {(
                  [
                    { k: "phone" as const, l: "Κινητό 1" },
                    { k: "phone2" as const, l: "Κινητό 2" },
                    { k: "landline" as const, l: "Σταθερό" },
                    { k: "email" as const, l: "Email" },
                  ] as const
                ).map((row) => (
                  <div key={row.k} className={fieldGap}>
                    <span className={lbl}>{row.l}</span>
                    {canEdit && editing === "comm" && w ? (
                      <input
                        className={inputSm}
                        value={String((w as unknown as Record<string, string | null>)[row.k] ?? "")}
                        onChange={(e) =>
                          setBuf({ ...w, [row.k]: e.target.value || null } as Contact)
                        }
                      />
                    ) : (
                      <p className={row.k === "email" ? val : val + " font-mono"}>
                        {disp(c?.[row.k] as string | null)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Γρήγορη αντιγραφή
                </h3>
                <div className="space-y-2.5">
                  <QuickCopyRow
                    label="Κινητό 1"
                    value={live.phone?.trim() ?? ""}
                    mono
                    copyLabel="Αντιγραφή κινητού 1"
                  />
                  <QuickCopyRow
                    label="Κινητό 2"
                    value={live.phone2?.trim() ?? ""}
                    mono
                    copyLabel="Αντιγραφή κινητού 2"
                  />
                  <QuickCopyRow
                    label="Σταθερό"
                    value={live.landline?.trim() ?? ""}
                    mono
                    copyLabel="Αντιγραφή σταθερού"
                  />
                  <QuickCopyRow
                    label="Μικρό Όνομα"
                    value={live.first_name?.trim() ?? ""}
                    copyLabel="Αντιγραφή μικρού ονόματος"
                  />
                  <QuickCopyRow
                    label="Επίθετο"
                    value={live.last_name?.trim() ?? ""}
                    copyLabel="Αντιγραφή επιθέτου"
                  />
                  <QuickCopyRow
                    label="Ονοματεπώνυμο"
                    value={onomaTeponymo}
                    copyLabel="Αντιγραφή ονοματεπωνύμου"
                  />
                  <QuickCopyRow
                    label="Email"
                    value={live.email?.trim() ?? ""}
                    copyLabel="Αντιγραφή email"
                  />
                </div>
              </div>
            </div>

            <div {...animDelay(5)} className={card}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Phone className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden />
                Τελευταία επικοινωνία
              </h2>
              {lastCommAt ? (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{formatCallLogDateTime(lastCommAt)}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{formatRelativeAthens(lastCommAt)}</p>
                    {lastCommMarker ? (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">από: {lastCommMarker}</p>
                    ) : null}
                  </div>
                  {canDeleteCommLogs && latestCommLog ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteCallLog(latestCommLog.id)}
                      className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Διαγραφή καταγραφής επικοινωνίας"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Δεν υπάρχει καταγεγραμμένη επικοινωνία.</p>
              )}
              <button
                type="button"
                disabled={markingContacted}
                onClick={() => void handleMarkContacted()}
                className={"mt-2 inline-flex items-center gap-1.5 " + lux.linkAction + " disabled:opacity-50"}
              >
                <Check className="h-3 w-3" aria-hidden />
                {markingContacted ? "Αποθήκευση…" : "Σήμανση ως επικοινωνία τώρα"}
              </button>
            </div>

            <div {...animDelay(6)} className={card}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <CalendarDays className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                Ημερολόγιο
              </h2>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>Από</span>
                <HqSelect
                  className="!h-8 !min-h-0 w-auto rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                  value={String(calendarYearsBack)}
                  onChange={(e) => setCalendarYearsBack(Number(e.target.value))}
                  aria-label="Έτη πριν"
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </HqSelect>
                <span>έτη πριν — Μέχρι</span>
                <HqSelect
                  className="!h-8 !min-h-0 w-auto rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                  value={String(calendarYearsForward)}
                  onChange={(e) => setCalendarYearsForward(Number(e.target.value))}
                  aria-label="Έτη στο μέλλον"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </HqSelect>
                <span>έτη στο μέλλον</span>
              </div>
              {eventsLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>
              ) : contactEvents.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Δε βρέθηκαν εκδηλώσεις (RSVP).</p>
              ) : (
                <ul className="space-y-0">
                  {contactEvents.map((event) => (
                    <li
                      key={event.id}
                      className="flex items-center gap-3 border-b border-[var(--border)]/50 py-2 last:border-0"
                    >
                      <div className="w-20 shrink-0 text-xs text-[var(--text-muted)]">{formatCalendarDateOnly(event.date)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{event.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {[event.start_time, event.end_time].filter(Boolean).join(" — ") || event.type || "—"}
                          {event.rsvp_status ? ` · ${event.rsvp_status}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* E Requests */}
            {canManage && (
              <div {...animDelay(7)} className={card}>
                <h2 className={cardTitle}>Αιτήματα</h2>
                <ul className="mb-3 space-y-2">
                  {requests.length === 0 && <li className="text-xs text-muted-foreground">Κανένα αίτημα.</li>}
                  {requests.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/requests/${r.id}`)}
                        className="flex w-full cursor-pointer items-start justify-between gap-2 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-[color-mix(in_srgb,var(--accent-gold)_35%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent-gold)_4%,var(--bg-card))]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {r.request_code ?? "—"}
                            </span>
                            <ReqStatus s={r.status} />
                          </div>
                          <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.category ?? "—"} ·{" "}
                            {r.created_at ? formatDateAthens(r.created_at) : "—"}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                {openReq ? (
                  <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-gold)]">
                          Νέο Αίτημα
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Καταχώρηση αιτήματος για αυτή την επαφή
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenReq(false)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bg-elevated)_80%,var(--bg-card))]"
                        aria-label="Κλείσιμο φόρμας"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <label className={inlineFormLabel}>Τίτλος *</label>
                      <input
                        type="text"
                        className={inlineFormControl}
                        placeholder="Περιγράψτε σύντομα το αίτημα..."
                        value={newRequest.title}
                        onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className={inlineFormLabel}>Κατηγορία</label>
                        <HqSelect
                          className={inlineFormControl + " !pr-9"}
                          value={newRequest.category}
                          onChange={(e) => setNewRequest({ ...newRequest, category: e.target.value })}
                        >
                          <option>Υγεία</option>
                          <option>Εκπαίδευση</option>
                          <option>Εργασία</option>
                          <option>Υποδομές</option>
                          <option>Άλλο</option>
                        </HqSelect>
                      </div>
                      <div>
                        <label className={inlineFormLabel}>Κατάσταση</label>
                        <HqSelect
                          className={inlineFormControl + " !pr-9"}
                          value={newRequest.status}
                          onChange={(e) => setNewRequest({ ...newRequest, status: e.target.value })}
                        >
                          {REQUEST_STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </HqSelect>
                      </div>
                    </div>
                    <div>
                      <label className={inlineFormLabel}>Ανάθεση σε</label>
                      <input
                        type="text"
                        className={inlineFormControl}
                        placeholder="Ανάθεση σε"
                        value={newRequest.assigned_to}
                        onChange={(e) => setNewRequest({ ...newRequest, assigned_to: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={inlineFormLabel}>Περιγραφή</label>
                      <textarea
                        rows={3}
                        className={inlineFormControl + " resize-none"}
                        placeholder="Λεπτομέρειες αιτήματος..."
                        value={newRequest.description}
                        onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setOpenReq(false)}
                        className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-card))]"
                      >
                        Άκυρο
                      </button>
                      <button
                        type="button"
                        onClick={() => void addRequest()}
                        className="flex-1 rounded-xl bg-[var(--accent-gold)] py-2.5 text-sm font-semibold text-[var(--text-badge-on-gold)] transition-colors hover:brightness-95"
                      >
                        Αποθήκευση
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenReq(true)}
                    className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2.5 text-xs font-semibold text-[var(--accent-gold)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-gold)_6%,var(--bg-card))]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Νέο αίτημα
                  </button>
                )}
              </div>
            )}

            {/* F Tasks */}
            {canManage && (
              <div {...animDelay(6)} className={card}>
                <h2 className={cardTitle}>Εργασίες</h2>
                <ul className="mb-2 space-y-1.5">
                  {tasks.length === 0 && <li className="text-xs text-[var(--text-muted)]">Καμία εργασία.</li>}
                  {tasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-2 rounded-md border border-transparent py-0.5 hover:border-[var(--border)]"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
                        checked={t.completed}
                        onChange={() => void toggleTask(t)}
                      />
                      <div>
                        <p
                          className={
                            t.completed
                              ? "text-sm text-[var(--text-muted)] line-through"
                              : "text-sm text-[var(--text-primary)]"
                          }
                        >
                          {t.title}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {t.due_date
                            ? formatCalendarDateOnly(t.due_date)
                            : "Χωρίς ημερομηνία"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {openTask ? (
                  <div className="mt-1 space-y-3 rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-gold)]">
                          Νέα Εργασία
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenTask(false)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bg-elevated)_80%,var(--bg-card))]"
                        aria-label="Κλείσιμο φόρμας"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <label className={inlineFormLabel}>Τίτλος Εργασίας *</label>
                      <input
                        type="text"
                        className={inlineFormControl}
                        placeholder="Τι πρέπει να γίνει..."
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={inlineFormLabel}>Προθεσμία</label>
                      <input
                        type="date"
                        className={inlineFormControl + " [color-scheme:light] dark:[color-scheme:dark]"}
                        value={newTask.due_date}
                        onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setOpenTask(false)}
                        className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-card))]"
                      >
                        Άκυρο
                      </button>
                      <button
                        type="button"
                        onClick={() => void addTask()}
                        className="flex-1 rounded-xl bg-[var(--accent-gold)] py-2.5 text-sm font-semibold text-[var(--text-badge-on-gold)] transition-colors hover:brightness-95"
                      >
                        Αποθήκευση
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenTask(true)}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2.5 text-xs font-semibold text-[var(--accent-gold)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-gold)_6%,var(--bg-card))]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Νέα εργασία
                  </button>
                )}
              </div>
            )}

            {/* G Calls timeline */}
            <div {...animDelay(7)} className={card}>
              <h2 className={cardTitle}>Ιστορικό κλήσεων</h2>
              {calls.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Δεν υπάρχουν κλήσεις ακόμα</p>
              ) : (
                <ul className="relative space-y-0">
                  {calls.map((cl, i) => (
                    <li key={cl.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < calls.length - 1 && (
                        <span className="absolute left-2 top-4 h-[calc(100%-4px)] w-px bg-[var(--border)]" />
                      )}
                      <span className="relative z-[1] mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#C9A84C] ring-2 ring-white" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                          {cl.called_at ? formatCallLogDateTime(cl.called_at) : "—"}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <OutcomeBadge o={cl.outcome} />
                          {cl.duration_seconds != null && (
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {cl.duration_seconds}s
                            </span>
                          )}
                        </div>
                        {cl.notes && <p className="mt-1 text-xs text-[var(--text-secondary)]">{cl.notes}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      <div className="mt-6 border-t border-[var(--border)] pt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
        <div className="text-xs text-[var(--text-muted)]">
          {(c.author_name?.trim() || c.created_by_name?.trim()) && (
            <span>
              Δημιουργία από:{" "}
              <span className="font-medium text-[var(--text-secondary)]">
                {c.author_name?.trim() || c.created_by_name?.trim()}
              </span>
              {c.created_at ? " · " : null}
            </span>
          )}
          {c.created_at && <span className="text-[var(--text-secondary)]">{formatDateTimeEnGb(c.created_at)}</span>}
        </div>
        {c.updated_by && c.updated_at ? (
          <p className="mt-1.5">
            Τελευταία ενημέρωση: <span className="text-[var(--text-secondary)]">{formatDateTimeEnGb(c.updated_at)}</span>
            {c.updated_by_name?.trim() ? (
              <span> ({c.updated_by_name.trim()})</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
      </div>
    </div>
  );
}

export default function ContactDetailPageWithBoundary() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--text-muted)]">
          Φόρτωση…
        </div>
      }
    >
      <CrmErrorBoundary title="Δεν φορτώθηκε η επαφή.">
        <ContactDetailPage />
      </CrmErrorBoundary>
    </Suspense>
  );
}
