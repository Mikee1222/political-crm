"use client";

import { Clipboard, Phone, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { callStatusLabel, callStatusPill, priorityPill } from "@/lib/luxury-styles";
import { AitoloakarnaniaLocationFields } from "@/components/aitoloakarnania-location-fields";

const card =
  "rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const cardTitle =
  "mb-4 border-b border-[var(--border)] pb-3 text-sm font-semibold text-[var(--text-primary)]";
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
const btnOutline =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]";

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
  birthday: string | null;
  municipality: string | null;
  electoral_district: string | null;
  toponym: string | null;
  call_status: string | null;
  notes: string | null;
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

function fmtDate(s: string | null | undefined) {
  if (s == null || String(s).trim() === "") return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return disp(s);
  return d.toLocaleDateString("el-GR");
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

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/contacts/${id}`);
    const data = await res.json();
    if (data.error) {
      setContact(null);
      return;
    }
    setContact(data.contact ?? null);
    setBuf(null);
    setEditing(null);
    setCalls((data.calls ?? []) as Call[]);
    setTasks((data.tasks ?? []) as Task[]);
    setRequests((data.requests ?? []) as RequestItem[]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const res = await fetch(`/api/contacts/${id}`, {
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
      });
    } else if (s === "comm") {
      await patch({ phone: buf.phone, email: buf.email, area: buf.area });
    }
  };

  const onNotesBlur = async (next: string) => {
    if (!c || !canManage) return;
    const v = next.trim() ? next : null;
    if (v === (c.notes ?? null)) return;
    await patch({ notes: v });
  };

  const addRequest = async () => {
    if (!c || !newRequest.title.trim()) return;
    await fetch("/api/requests", {
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
    const res = await fetch("/api/tasks", {
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
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    await load();
  };

  const triggerCall = async () => {
    if (!c) return;
    await fetch("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: c.id }),
    });
  };

  const saveCallerStatus = async () => {
    if (!c) return;
    setSaving(true);
    try {
      await fetch(`/api/contacts/${id}`, {
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
  const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Επαφή";
  const initials = `${(c.first_name?.[0] ?? "?").toUpperCase()}${(c.last_name?.[0] ?? "?").toUpperCase()}`;
  const live = w ?? c;
  const onomaTeponymo = [live.first_name, live.last_name].filter(Boolean).join(" ").trim();

  return (
    <div className="min-h-full -m-6 bg-[var(--bg-primary)] p-4 text-[var(--text-primary)] sm:p-6 md:-m-8 md:p-8">
      {isCaller && (
        <p className="mb-4 rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
          Προβολή — μπορείτε να αλλάξετε μόνο την <strong>κατάσταση κλήσης</strong>· αποθήκευση παρακάτω.
        </p>
      )}

      {/* Header */}
      <div
        className={`mb-4 flex max-md:sticky max-md:top-0 z-20 max-md:backdrop-blur flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)]/95 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:bg-[var(--bg-card)] max-md:px-3`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#003476] text-base font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-[var(--text-primary)]">{fullName}</h1>
            <p className="mt-0.5 font-mono text-sm text-[var(--text-muted)]">{disp(c.phone)}</p>
            <p className="text-sm text-[var(--text-muted)]">Περιοχή: {disp(c.area)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isCaller ? (
            <>
              <span
                className={
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                  (priorityPill[pr] ?? priorityPill.Medium)
                }
              >
                {pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
              </span>
              <select
                aria-label="Κατάσταση κλήσης"
                className={inputSm + " w-auto min-w-[140px]"}
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
                className="h-8 rounded-lg bg-[#003476] px-3 text-xs font-semibold text-white hover:bg-[#002255] disabled:opacity-50"
              >
                Αποθήκευση
              </button>
            </>
          ) : (
            <>
              <span
                className={
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                  (callStatusPill[st] ?? callStatusPill.Pending)
                }
              >
                {callStatusLabel(c.call_status)}
              </span>
              <span
                className={
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " + (priorityPill[pr] ?? priorityPill.Medium)
                }
              >
                {pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
              </span>
              <button type="button" onClick={triggerCall} className={btnOutline}>
                <Phone className="h-3.5 w-3.5" />
                Outbound (Retell)
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,55%)_minmax(0,45%)]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* A Personal */}
            <div className={[card, canManage && editing === "personal" && mobileEditOverlay].filter(Boolean).join(" ")}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className={cardTitle + " m-0 flex-1 !mb-0 border-0 p-0"}>Προσωπικά στοιχεία</h2>
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
                  <div key={row.k} className={fieldGap}>
                    <span className={lbl}>{row.l}</span>
                    {inEdit ? (
                      isDate ? (
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
                      )
                    ) : (
                      <p className={val}>{displayVal}</p>
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
              </div>
            </div>

            {/* B Electoral */}
            <div className={[card, canManage && editing === "electoral" && mobileEditOverlay].filter(Boolean).join(" ")}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={cardTitle + " m-0 border-0 p-0 !mb-0"}>Εκλογική πληροφόρηση</h2>
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
                ) : (
                  (["municipality", "electoral_district", "toponym"] as const).map((k) => {
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
                )}
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
              </div>
            </div>

            {/* D Notes */}
            <div className={card}>
              <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Σημειώσεις</h2>
              <textarea
                className="min-h-[100px] w-full resize-y rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#003476] focus:outline-none focus:ring-1 focus:ring-[#003476]/20"
                placeholder="Προσθήκη σημείωσης…"
                value={c.notes ?? ""}
                onChange={(e) => {
                  const n = e.target.value || null;
                  setContact((prev) => (prev ? { ...prev, notes: n } : null));
                }}
                onBlur={(e) => void onNotesBlur(e.target.value)}
                disabled={!canManage}
                readOnly={!canManage}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {/* C Comm — right column, above αιτήματα */}
            <div className={[card, canManage && editing === "comm" && mobileEditOverlay].filter(Boolean).join(" ")}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={cardTitle + " m-0 !mb-0 border-0 p-0"}>Επικοινωνία</h2>
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
                    { k: "phone" as const, l: "Τηλέφωνο" },
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
                      <p className={row.k === "phone" ? val + " font-mono" : val}>
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
                    label="Τηλέφωνο"
                    value={live.phone?.trim() ?? ""}
                    mono
                    copyLabel="Αντιγραφή τηλεφώνου"
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
              <div className={card}>
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
              <div className={card}>
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
            <div className={card}>
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
    </div>
  );
}
