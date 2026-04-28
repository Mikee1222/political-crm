"use client";

import { useCallback, useEffect, useMemo, useState, startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { FileText, Inbox, Pencil, Stethoscope, Wrench, HelpCircle } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux, priorityPill } from "@/lib/luxury-styles";
import { NewRequestModal } from "@/components/requests/new-request-modal";
import type { RequestCategoryRow } from "@/lib/request-categories";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";

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

function RequestsMobileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="hq-skeleton-shimmer h-52 rounded-[20px] border border-[var(--border)]/40 shadow-[var(--card-shadow)]" />
      ))}
    </div>
  );
}

export default function RequestsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ status, category });
    setListLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/requests?${q.toString()}`);
      const data = await res.json();
      setRows(data.requests ?? []);
    } finally {
      setListLoading(false);
    }
  }, [status, category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreateOpen(true);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("new");
    const q = p.toString();
    startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }, [searchParams, router, pathname]);

  const categories = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[];
  }, [rows]);

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

      <div className={lux.card + " !p-4 sm:!p-5"}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={lux.label} htmlFor="r-st">
              Κατάσταση
            </label>
            <HqSelect id="r-st" className="hq-input-elevated" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Όλες οι καταστάσεις</option>
              <option value="Νέο">Νέο</option>
              <option value="Σε εξέλιξη">Σε εξέλιξη</option>
              <option value="Ολοκληρώθηκε">Ολοκληρώθηκε</option>
              <option value="Απορρίφθηκε">Απορρίφθηκε</option>
            </HqSelect>
          </div>
          <div>
            <label className={lux.label} htmlFor="r-cat">
              Κατηγορία
            </label>
            <HqSelect id="r-cat" className="hq-input-elevated" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Όλες οι κατηγορίες</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </HqSelect>
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
                onOpen={() => router.push(`/requests/${r.id}`)}
                onEdit={() => setSelected(r)}
              />
            </div>
          ))}
        </div>
      )}

      <NewRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      {selected && <EditRequestModal request={selected} onClose={() => setSelected(null)} onSaved={load} />}
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
  if (status === "Ολοκληρώθηκε" || status === "Απορρίφθηκε") return null;
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
  onOpen,
  onEdit,
}: {
  r: RequestRow;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const st = categoryStyle(r.category);
  const Icon = st.Icon;
  const days = daysLeftSla(r.sla_due_date, r.status ?? "Νέο");
  return (
    <article
      className={`hq-table-row-interactive group flex min-h-[180px] cursor-pointer flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm transition duration-200 hover:shadow-md ${st.left}`}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={`h-5 w-5 shrink-0 ${st.iconClass}`} aria-hidden />
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{r.request_code ?? "—"}</span>
        </div>
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
        <StatusBadge status={r.status ?? "Νέο"} withDot />
        <PriorityPill p={r.priority} />
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">
          {r.created_at ? new Date(r.created_at).toLocaleDateString("el-GR") : ""}
        </span>
      </div>
    </article>
  );
}

function PriorityPill({ p }: { p: string | null | undefined }) {
  const k = p === "High" || p === "Low" || p === "Medium" ? p : "Medium";
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
  const styles: Record<string, string> = {
    "Νέο": "bg-[var(--status-req-new-bg)] text-[var(--status-req-new-fg)] ring-1 ring-inset ring-[var(--status-req-new-ring)]",
    "Σε εξέλιξη": "bg-[var(--status-req-prog-bg)] text-[var(--status-req-prog-fg)] ring-1 ring-inset ring-[var(--status-req-prog-ring)]",
    "Ολοκληρώθηκε": "bg-[var(--status-req-done-bg)] text-[var(--status-req-done-fg)] ring-1 ring-inset ring-[var(--status-req-done-ring)]",
    "Απορρίφθηκε": "bg-[var(--status-req-rej-bg)] text-[var(--status-req-rej-fg)] ring-1 ring-inset ring-[var(--status-req-rej-ring)]",
  };
  const s = status || "Νέο";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[s] ?? styles["Νέο"]
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
  const [categories, setCategories] = useState<RequestCategoryRow[]>([]);
  const [form, setForm] = useState({
    title: request.title,
    description: request.description ?? "",
    category: request.category ?? "Άλλο",
    status: request.status ?? "Νέο",
    priority: (request.priority === "High" || request.priority === "Low" ? request.priority : "Medium") as
      | "High"
      | "Medium"
      | "Low",
    assigned_to: request.assigned_to ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithTimeout("/api/request-categories");
      if (res.ok) {
        const j = (await res.json()) as { categories?: RequestCategoryRow[] };
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
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
            </HqSelect>
          </div>
          <div>
            <label className={lux.label}>Κατάσταση</label>
            <HqSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Νέο</option>
              <option>Σε εξέλιξη</option>
              <option>Ολοκληρώθηκε</option>
              <option>Απορρίφθηκε</option>
            </HqSelect>
          </div>
          <div>
            <label className={lux.label}>Priority</label>
            <HqSelect
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as "High" | "Medium" | "Low" })
              }
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
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
          <button type="button" onClick={() => void remove()} className="text-sm font-medium text-[#DC2626] hover:underline" disabled={saving}>
            Διαγραφή αιτήματος
          </button>
        </div>
    </CenteredModal>
  );
}
