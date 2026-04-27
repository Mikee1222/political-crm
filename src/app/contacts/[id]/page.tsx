"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Clipboard, Pencil, Phone, Plus, Sparkles, User, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { useProfile } from "@/contexts/profile-context";
import { useOptionalAlexandraPageContact } from "@/contexts/alexandra-page-context";
import { hasMinRole } from "@/lib/roles";
import { callStatusLabel, callStatusPill, lux, priorityPill } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { AitoloakarnaniaLocationFields } from "@/components/aitoloakarnania-location-fields";
import type { ContactGroupRow } from "@/lib/contact-groups";

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
  "h-9 w-full min-h-[44px] max-w-full rounded-lg border border-[var(--border)] px-2.5 text-sm text-[var(--text-primary)] focus:border-[#003476] focus:outline-none focus:ring-1 focus:ring-[#003476]/20 max-md:min-h-[48px] max-md:text-base";
const mobileEditOverlay =
  "max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:top-0 z-[100] m-0 max-h-[100dvh] w-full max-w-full max-md:overflow-y-auto max-md:overflow-x-hidden max-md:rounded-none max-md:border-0 max-md:shadow-2xl max-md:p-4 max-md:pt-[max(0.5rem,env(safe-area-inset-top,0px))] max-md:pb-[max(1rem,env(safe-area-inset-bottom,0px))]";
const btnEdit =
  "text-xs font-semibold text-[#003476] hover:underline";

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
  created_by_name?: string | null;
  updated_by_name?: string | null;
  group_id: string | null;
  is_volunteer?: boolean | null;
  volunteer_role?: string | null;
  volunteer_area?: string | null;
  volunteer_since?: string | null;
  language?: string | null;
  contact_groups?: Pick<ContactGroupRow, "id" | "name" | "color" | "description" | "year"> | null;
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
  author_full_name: string;
};

const CALL_OPTS = [
  { value: "Pending", label: "Αναμονή" },
  { value: "Positive", label: "Θετικός" },
  { value: "Negative", label: "Αρνητικός" },
  { value: "No Answer", label: "Δεν απάντησε" },
] as const;

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
    c.municipality?.trim() || c.area?.trim() ? `Τοποθεσία: ${[c.municipality, c.area].filter(Boolean).join(" · ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function fmtDate(s: string | null | undefined) {
  if (s == null || String(s).trim() === "") return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return disp(s);
  return d.toLocaleDateString("el-GR");
}

function fmtDateTime(s: string | null | undefined) {
  if (s == null || String(s).trim() === "") return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
  const t = s ?? "Νέο";
  const map: Record<string, string> = {
    "Νέο": "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/30",
    "Σε εξέλιξη": "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
    "Ολοκληρώθηκε": "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
    "Απορρίφθηκε": "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[t] ?? "bg-slate-500/20 text-[#E2E8F0]"}`}>
      {t}
    </span>
  );
}

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
          ✓ Αντιγράφηκε
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

export default function ContactDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { profile } = useProfile();
  const isCaller = profile?.role === "caller";
  const canManage = hasMinRole(profile?.role, "manager");
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
    status: "Νέο",
    assigned_to: "",
  });
  const [openReq, setOpenReq] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [openTask, setOpenTask] = useState(false);
  const [headerCopied, setHeaderCopied] = useState(false);
  const [groupOptions, setGroupOptions] = useState<ContactGroupRow[]>([]);
  const [supporters, setSupporters] = useState<SupporterRow[]>([]);
  const [newSup, setNewSup] = useState({ support_type: "Οικονομική", amount: "", date: "", notes: "" });
  const [contactNotes, setContactNotes] = useState<ContactNoteItem[]>([]);
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
  const alexPage = useOptionalAlexandraPageContact();

  const load = useCallback(async () => {
    if (!id) return;
    const [res, notesRes] = await Promise.all([
      fetchWithTimeout(`/api/contacts/${id}`),
      fetchWithTimeout(`/api/contacts/${id}/notes`),
    ]);
    const data = await res.json();
    if (data.error) {
      setContact(null);
      setContactNotes([]);
      return;
    }
    if (notesRes.ok) {
      const njson = (await notesRes.json()) as { notes?: ContactNoteItem[] };
      setContactNotes(njson.notes ?? []);
    } else {
      setContactNotes([]);
    }
    const raw = data.contact as Contact | null;
    if (raw) {
      const g = raw.contact_groups;
      const contact_groups = Array.isArray(g) ? g[0] ?? null : g ?? null;
      setContact({
        ...raw,
        contact_groups,
        group_id: raw.group_id ?? null,
        phone2: raw.phone2 ?? null,
        landline: raw.landline ?? null,
      });
    } else {
      setContact(null);
    }
    setBuf(null);
    setEditing(null);
    setCalls((data.calls ?? []) as Call[]);
    setTasks((data.tasks ?? []) as Task[]);
    setRequests((data.requests ?? []) as RequestItem[]);
    if (hasMinRole(profile?.role, "manager")) {
      const sr = await fetchWithTimeout(`/api/contacts/${id}/supporters`);
      if (sr.ok) {
        const sj = (await sr.json()) as { items?: SupporterRow[] };
        setSupporters(sj.items ?? []);
      } else {
        setSupporters([]);
      }
    }
  }, [id, profile?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!alexPage) return;
    if (!contact) {
      alexPage.setContactPage(null);
      return;
    }
    const name = `${contact.first_name} ${contact.last_name}`.trim();
    alexPage.setContactPage({ contactId: contact.id, contactName: name || "Επαφή" });
    return () => alexPage.setContactPage(null);
  }, [alexPage, contact]);

  useEffect(() => {
    fetchWithTimeout("/api/groups")
      .then((r) => r.json())
      .then((d: { groups?: ContactGroupRow[] }) => setGroupOptions(d.groups ?? []))
      .catch(() => setGroupOptions([]));
  }, []);

  useEffect(() => {
    if (!canManage || !id || !historyOpen) {
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    void (async () => {
      const res = await fetchWithTimeout(`/api/contacts/${id}/history`);
      if (cancelled) {
        return;
      }
      if (res.ok) {
        const j = (await res.json()) as {
          entries?: { id: string; user_id: string | null; action: string; entity_type: string; entity_name: string | null; details: unknown; created_at: string; user_name?: string }[];
        };
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
      setHistoryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, id, historyOpen]);

  const c = contact;
  const w = buf ?? c;

  const startEdit = (s: Exclude<Section, null>) => {
    if (!c || !canManage) return;
    setBuf({ ...c });
    setEditing(s);
  };
  const cancelEdit = () => {
    setBuf(null);
    setEditing(null);
  };

  const patch = async (body: Record<string, unknown>) => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("patch");
      await load();
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
      });
    } else if (s === "electoral") {
      await patch({
        municipality: buf.municipality,
        electoral_district: buf.electoral_district,
        toponym: buf.toponym,
        political_stance: buf.political_stance,
        source: buf.source,
        priority: buf.priority,
        call_status: buf.call_status,
        influence: buf.influence,
        group_id: buf.group_id,
        is_volunteer: buf.is_volunteer,
        volunteer_role: buf.volunteer_role,
        volunteer_area: buf.volunteer_area,
        volunteer_since: buf.volunteer_since,
      });
    } else if (s === "comm") {
      await patch({ phone: buf.phone, phone2: buf.phone2, landline: buf.landline, email: buf.email, area: buf.area });
    }
  };

  const addRequest = async () => {
    if (!c || !newRequest.title.trim()) return;
    await fetchWithTimeout("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newRequest, contact_id: c.id }),
    });
    setNewRequest({ title: "", description: "", category: "Άλλο", status: "Νέο", assigned_to: "" });
    setOpenReq(false);
    await load();
  };

  const addTask = async () => {
    if (!c || !newTask.title.trim()) return;
    const res = await fetchWithTimeout("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: c.id,
        title: newTask.title.trim(),
        due_date: newTask.due_date || null,
      }),
    });
    if (res.ok) {
      setNewTask({ title: "", due_date: "" });
      setOpenTask(false);
      await load();
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
      await fetchWithTimeout(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_status: c.call_status }),
      });
      await load();
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
    <div className="min-h-full -m-6 bg-[var(--bg-primary)] p-4 text-[var(--text-primary)] sm:p-6 md:-m-8 md:p-8">
      <Link
        href="/contacts"
        className={lux.btnSecondary + " mb-4 inline-flex w-fit items-center gap-2 !py-2 text-sm"}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Επαφές
      </Link>
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
        <div className="relative flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#003476] to-[#0a1f3a] text-lg font-bold text-white shadow-lg ring-2 ring-[var(--accent-gold)] ring-offset-2 ring-offset-[var(--bg-card)]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-2xl font-bold leading-tight text-[var(--text-card-title)]" style={{ fontSize: 24, lineHeight: 1.2 }}>
                {headNameLine}
              </h1>
              {headPatronym ? <p className="mt-1.5 text-base italic text-[var(--accent-gold)]">του {headPatronym}</p> : null}
              {motherGreek ? <p className="mt-1 text-sm text-[var(--text-muted)]">{motherGreek}</p> : null}
              <div
                className="mt-3 h-0.5 w-14 rounded-full bg-gradient-to-r from-[var(--accent-gold)] to-transparent"
                aria-hidden
              />
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
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
              <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 font-mono text-sm text-[var(--text-secondary)]">
                <span>{disp(c.phone)}</span>
                {c.phone2?.trim() ? <span className="text-xs text-[var(--text-muted)]">· {c.phone2}</span> : null}
                {c.landline?.trim() ? <span className="text-xs text-[var(--text-muted)]">· στ. {c.landline}</span> : null}
              </p>
              {c.area?.trim() ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">Περιοχή: {c.area}</p> : null}
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:max-w-[min(100%,380px)] lg:items-end">
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
                <select
                  aria-label="Κατάσταση κλήσης"
                  className={inputSm + " w-auto min-w-[140px] max-w-full"}
                  value={c.call_status ?? "Pending"}
                  onChange={(e) => setContact({ ...c, call_status: e.target.value })}
                >
                  {CALL_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
                {canManage && (
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
                <p className="w-full text-right text-[10px] text-[var(--text-muted)] sm:hidden">Retell: εξερχόμενη κλήση</p>
                <p className="hidden w-full text-right text-[10px] text-[var(--text-muted)] sm:block">Retell: εξερχόμενη κλήση (Outbound)</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-5">
          <div className="flex min-w-0 flex-col gap-4">
            {/* A Personal */}
            <div
              {...animDelay(0)}
              className={[cardGold, canManage && editing === "personal" && mobileEditOverlay].filter(Boolean).join(" ")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <User className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
                  <h2 className={cardTitle + " m-0 flex-1 !mb-0 border-0 p-0"}>Προσωπικά στοιχεία</h2>
                </div>
                {canManage && editing !== "personal" && (
                  <button type="button" onClick={() => startEdit("personal")} className={btnEdit}>
                    Επεξεργασία
                  </button>
                )}
                {canManage && editing === "personal" && (
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
                    { k: "birthday" as const, l: "Γενέθλια", date: true },
                    { k: "age" as const, l: "Ηλικία", num: true },
                    { k: "gender" as const, l: "Φύλο" },
                    { k: "occupation" as const, l: "Επάγγελμα" },
                  ] as const
                ).map((row) => {
                  const isDate = "date" in row && row.date;
                  const isNum = "num" in row && row.num;
                  const inEdit = canManage && editing === "personal" && w;
                  const raw = c?.[row.k];
                  const displayVal = isNum
                    ? c?.age != null
                      ? String(c.age)
                      : "—"
                    : isDate
                      ? fmtDate(raw as string | null)
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
                          value={String((w as Record<string, string | null>)[row.k] ?? "")}
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
                  <div className={fieldGap}>
                    <span className={lbl}>Ετικέτες</span>
                    {canManage && editing === "personal" && w ? (
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
                    {canManage && editing === "personal" && w ? (
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
              </div>
            </div>

            {/* B Electoral */}
            <div
              {...animDelay(1)}
              className={[cardBlue, canManage && editing === "electoral" && mobileEditOverlay].filter(Boolean).join(" ")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-[var(--accent-blue)]" aria-hidden />
                  <h2 className={cardTitle + " m-0 border-0 p-0 !mb-0 text-[var(--accent-blue-bright)]"}>Εκλογική πληροφόρηση</h2>
                </div>
                {canManage && editing !== "electoral" && (
                  <button type="button" onClick={() => startEdit("electoral")} className={btnEdit}>
                    Επεξεργασία
                  </button>
                )}
                {canManage && editing === "electoral" && (
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
              <div className={grid2} style={{ gap: "0.5rem" }}>
                {canManage && editing === "electoral" && w ? (
                  <div className="col-span-1 w-full min-w-0 sm:col-span-2">
                    <AitoloakarnaniaLocationFields
                      values={{
                        municipality: w.municipality,
                        electoral_district: w.electoral_district,
                        toponym: w.toponym,
                      }}
                      onChange={(v) => setBuf({ ...w, ...v } as Contact)}
                    />
                  </div>
                ) : null}
                {canManage && editing === "electoral" && w ? (
                  <div className="fieldGap sm:col-span-2">
                    <span className={lbl}>Ομάδα</span>
                    <select
                      className={inputSm}
                      value={w.group_id ?? ""}
                      onChange={(e) =>
                        setBuf({
                          ...w,
                          group_id: e.target.value || null,
                        } as Contact)
                      }
                    >
                      <option value="">— Χωρίς ομάδα —</option>
                      {groupOptions.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                          {g.year != null ? ` (${g.year})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {!(canManage && editing === "electoral" && w) ? (
                  <>
                    {(["municipality", "electoral_district", "toponym"] as const).map((k) => {
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
                    })}
                    <div className="fieldGap sm:col-span-2">
                      <span className={lbl}>Ομάδα</span>
                      {c.contact_groups ? (
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-semibold"
                            style={{
                              borderColor: c.contact_groups.color || "#003476",
                              color: c.contact_groups.color || "#003476",
                              background: "var(--bg-elevated)",
                            }}
                          >
                            {c.contact_groups.name}
                            {c.contact_groups.year != null ? ` · ${c.contact_groups.year}` : ""}
                          </span>
                          {c.contact_groups.description ? (
                            <span
                              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[9px] font-bold text-[var(--text-secondary)]"
                              title={c.contact_groups.description}
                            >
                              ?
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <p className={val}>—</p>
                      )}
                    </div>
                  </>
                ) : null}
                {(
                  [
                    { k: "political_stance" as const, l: "Πολιτική τοποθέτηση" },
                    { k: "source" as const, l: "Πηγή επαφής" },
                  ] as const
                ).map((row) => (
                  <div key={row.k} className={fieldGap}>
                    <span className={lbl}>{row.l}</span>
                    {canManage && editing === "electoral" && w ? (
                      <input
                        className={inputSm}
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
                  {canManage && editing === "electoral" && w ? (
                    <select
                      className={inputSm}
                      value={w.priority ?? "Medium"}
                      onChange={(e) => setBuf({ ...w, priority: e.target.value })}
                    >
                      <option value="High">Υψηλή</option>
                      <option value="Medium">Μεσαία</option>
                      <option value="Low">Χαμηλή</option>
                    </select>
                  ) : (
                    <p className={val}>{pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}</p>
                  )}
                </div>
                <div className={fieldGap}>
                  <span className={lbl}>Κατάσταση κλήσης</span>
                  {canManage && editing === "electoral" && w ? (
                    <select
                      className={inputSm}
                      value={w.call_status ?? "Pending"}
                      onChange={(e) => setBuf({ ...w, call_status: e.target.value })}
                    >
                      {CALL_OPTS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className={val}>{callStatusLabel(c.call_status)}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2">
                    {canManage && editing === "electoral" && w ? (
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
                  {canManage && editing === "electoral" && w ? (
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
                        placeholder="Περιοχή"
                        value={String((w as Contact).volunteer_area ?? "")}
                        onChange={(e) => setBuf({ ...w, volunteer_area: e.target.value || null } as Contact)}
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
                      {((c as Contact).volunteer_area ?? "") ? ` · ${(c as Contact).volunteer_area}` : ""}
                    </p>
                  )}
                </div>
              </div>
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
                              {new Date(h.created_at).toLocaleString("el-GR", { hour12: false })} — {h.user_name}
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
                {contactNotes.map((n) => {
                  const canDeleteThis =
                    Boolean(profile?.id) &&
                    (n.user_id === profile?.id || profile?.role === "admin");
                  return (
                    <li key={n.id}>
                      <div className="group relative rounded-md border border-[var(--border)] border-l-[3px] border-l-[var(--accent-gold)] bg-[var(--bg-elevated)]/35 p-3 pl-3 pr-2">
                        {canDeleteThis && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!id) return;
                              const dres = await fetchWithTimeout(
                                `/api/contacts/${id}/notes/${n.id}`,
                                { method: "DELETE" },
                              );
                              if (dres.ok) {
                                setContactNotes((prev) => prev.filter((x) => x.id !== n.id));
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
                            {authorInitials(n.author_full_name || "—")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[var(--text-primary)]">{n.author_full_name || "—"}</p>
                            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                              {fmtDateTime(n.created_at)}
                            </p>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                              {n.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {canManage && (
                <div className="mt-1 flex flex-col gap-2">
                  <textarea
                    className="min-h-[80px] w-full resize-y rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#003476] focus:outline-none focus:ring-1 focus:ring-[#003476]/20"
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

            {canManage && (
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    className={inputSm}
                    value={newSup.support_type}
                    onChange={(e) => setNewSup((x) => ({ ...x, support_type: e.target.value }))}
                  >
                    {["Οικονομική", "Εθελοντισμός", "Προπαγάνδα", "Άλλο"].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
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
              className={[cardGreen, canManage && editing === "comm" && mobileEditOverlay].filter(Boolean).join(" ")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden />
                  <h2 className={cardTitle + " m-0 !mb-0 border-0 p-0 text-[#34d399]"}>Επικοινωνία</h2>
                </div>
                {canManage && editing !== "comm" && (
                  <button type="button" onClick={() => startEdit("comm")} className={btnEdit}>
                    Επεξεργασία
                  </button>
                )}
                {canManage && editing === "comm" && (
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
                    { k: "area" as const, l: "Περιοχή" },
                  ] as const
                ).map((row) => (
                  <div key={row.k} className={fieldGap}>
                    <span className={lbl}>{row.l}</span>
                    {canManage && editing === "comm" && w ? (
                      <input
                        className={inputSm}
                        value={String((w as Record<string, string | null>)[row.k] ?? "")}
                        onChange={(e) =>
                          setBuf({ ...w, [row.k]: e.target.value || null } as Contact)
                        }
                      />
                    ) : (
                      <p className={row.k === "email" || row.k === "area" ? val : val + " font-mono"}>
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

            {/* E Requests */}
            {canManage && (
              <div {...animDelay(5)} className={card}>
                <h2 className={cardTitle}>Αιτήματα</h2>
                <ul className="mb-3 space-y-2">
                  {requests.length === 0 && <li className="text-xs text-[var(--text-muted)]">Κανένα αίτημα.</li>}
                  {requests.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-2 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{r.title}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {r.created_at
                            ? new Date(r.created_at).toLocaleDateString("el-GR")
                            : "—"}
                        </p>
                      </div>
                      <ReqStatus s={r.status} />
                    </li>
                  ))}
                </ul>
                {openReq ? (
                  <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                    <input
                      className={inputSm}
                      placeholder="Τίτλος *"
                      value={newRequest.title}
                      onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        className={inputSm}
                        value={newRequest.category}
                        onChange={(e) => setNewRequest({ ...newRequest, category: e.target.value })}
                      >
                        <option>Υγεία</option>
                        <option>Εκπαίδευση</option>
                        <option>Εργασία</option>
                        <option>Υποδομές</option>
                        <option>Άλλο</option>
                      </select>
                      <select
                        className={inputSm}
                        value={newRequest.status}
                        onChange={(e) => setNewRequest({ ...newRequest, status: e.target.value })}
                      >
                        <option>Νέο</option>
                        <option>Σε εξέλιξη</option>
                        <option>Ολοκληρώθηκε</option>
                        <option>Απορρίφθηκε</option>
                      </select>
                    </div>
                    <input
                      className={inputSm}
                      placeholder="Ανάθεση σε"
                      value={newRequest.assigned_to}
                      onChange={(e) => setNewRequest({ ...newRequest, assigned_to: e.target.value })}
                    />
                    <textarea
                      className="min-h-[64px] w-full rounded-lg border border-[var(--border)] p-2 text-sm"
                      placeholder="Περιγραφή"
                      value={newRequest.description}
                      onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" className="text-xs text-[var(--text-secondary)]" onClick={() => setOpenReq(false)}>
                        Άκυρο
                      </button>
                      <button
                        type="button"
                        onClick={() => void addRequest()}
                        className="h-8 rounded-lg bg-[#003476] px-3 text-xs font-semibold text-white"
                      >
                        Αποθήκευση
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenReq(true)}
                    className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] py-2 text-xs font-semibold text-[#003476] hover:bg-[var(--bg-elevated)]"
                  >
                    <Plus className="h-3.5 w-3.5" />+ Νέο αίτημα
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
                        className="mt-1 h-3.5 w-3.5 rounded border-[var(--border)] text-[#003476] focus:ring-[#003476]/30"
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
                            ? new Date(t.due_date).toLocaleDateString("el-GR")
                            : "Χωρίς ημερομηνία"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {openTask ? (
                  <div className="mt-1 space-y-2 rounded-lg border border-[var(--border)] p-2">
                    <input
                      className={inputSm}
                      placeholder="Τίτλος εργασίας *"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    />
                    <input className={inputSm} type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
                    <div className="flex justify-end gap-2">
                      <button type="button" className="text-xs" onClick={() => setOpenTask(false)}>
                        Άκυρο
                      </button>
                      <button
                        type="button"
                        className="h-7 rounded bg-[#003476] px-2 text-xs text-white"
                        onClick={() => void addTask()}
                      >
                        Αποθήκευση
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenTask(true)}
                    className="inline-flex w-full items-center justify-center gap-1 border border-dashed border-[var(--border)] py-1.5 text-xs font-semibold text-[#003476]"
                  >
                    <Plus className="h-3 w-3" />+ Νέα εργασία
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
                          {cl.called_at
                            ? new Date(cl.called_at).toLocaleString("el-GR")
                            : "—"}
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
        <p>
          Δημιουργήθηκε από <span className="text-[var(--text-secondary)]">{c.created_by_name?.trim() || "—"}</span> στις{" "}
          <span className="text-[var(--text-secondary)]">{fmtDateTime(c.created_at)}</span>
        </p>
        {c.updated_by && c.updated_at ? (
          <p className="mt-1.5">
            Τελευταία ενημέρωση: <span className="text-[var(--text-secondary)]">{fmtDateTime(c.updated_at)}</span>
            {c.updated_by_name?.trim() ? (
              <span> ({c.updated_by_name.trim()})</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
