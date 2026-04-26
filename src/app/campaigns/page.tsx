"use client";

import Link from "next/link";
import { FileText, LayoutGrid, Megaphone, Plus, Play, Search, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

type Campaign = {
  id: string;
  name: string;
  started_at: string | null;
  created_at: string | null;
  description: string | null;
  status: string;
  stats: OutcomeStats;
  progress: number;
  callsMade: number;
  contactTotal: number;
};

type FieldOptions = { areas: string[]; municipalities: string[] };

type NewFilter = {
  call_status: string;
  area: string;
  municipality: string;
  priority: string;
  tag: string;
};

const statusStyle =
  "inline-flex min-h-7 min-w-0 max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide";

const goldBtnBase =
  "no-mobile-scale inline-flex h-12 min-h-12 w-full min-w-0 max-w-sm items-center justify-center gap-2 self-start rounded-full border-2 border-[#8B6914] bg-gradient-to-b from-[#E8C96B] to-[#8B6914] px-6 text-sm font-bold text-[#0A1628] shadow-[0_0_0_1px_rgba(0,0,0,0.2)] transition duration-200 ease-out hover:brightness-110 active:scale-[0.99] sm:w-auto";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState<NewFilter>({
    call_status: "",
    area: "",
    municipality: "",
    priority: "",
    tag: "",
  });
  const [options, setOptions] = useState<FieldOptions | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dialingId, setDialingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    if (!res.ok) return;
    setCampaigns((data.campaigns ?? []) as Campaign[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!modal) return;
    fetch("/api/contacts/field-options")
      .then((r) => r.json())
      .then((d: FieldOptions) => setOptions({ areas: d.areas ?? [], municipalities: d.municipalities ?? [] }))
      .catch(() => setOptions({ areas: [], municipalities: [] }));
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    const q = new URLSearchParams();
    if (filter.call_status) q.set("call_status", filter.call_status);
    if (filter.area) q.set("area", filter.area);
    if (filter.municipality) q.set("municipality", filter.municipality);
    if (filter.priority) q.set("priority", filter.priority);
    if (filter.tag) q.set("tag", filter.tag);
    if (!q.toString()) {
      setPreviewCount(null);
      return;
    }
    setPreviewing(true);
    const t = setTimeout(() => {
      fetch(`/api/campaigns/preview?${q.toString()}`)
        .then((r) => r.json())
        .then((d) => setPreviewCount(typeof d.count === "number" ? d.count : null))
        .catch(() => setPreviewCount(null))
        .finally(() => setPreviewing(false));
    }, 300);
    return () => clearTimeout(t);
  }, [modal, filter]);

  const createCampaign = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      const f = {
        call_status: filter.call_status || undefined,
        area: filter.area || undefined,
        municipality: filter.municipality || undefined,
        priority: filter.priority || undefined,
        tag: filter.tag || undefined,
      };
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, filter: f }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; assigned_contacts?: number };
      if (!res.ok) {
        setFormErr(d.error ?? "Σφάλμα");
        return;
      }
      setModal(false);
      setName("");
      setDescription("");
      setFilter({ call_status: "", area: "", municipality: "", priority: "", tag: "" });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const totalN = campaigns.length;
  const activeN = campaigns.filter((c) => c.status === "active").length;
  const doneN = campaigns.filter((c) => c.status === "completed").length;

  return (
    <div className="space-y-8 max-md:space-y-6">
      <section
        className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-4 shadow-[0_4px_32px_rgba(0,0,0,0.45)] sm:p-6"
        style={{
          background: "linear-gradient(145deg, #0A1628 0%, #050D1A 50%, #0F1E35 100%)",
        }}
      >
        <div className="pointer-events-none absolute -right-12 -top-8 h-40 w-40 rounded-full bg-[#C9A84C]/10 blur-3xl" aria-hidden />
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Καμπάνιες</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Θέση κλήσεων, αποτελέσματα & πλήρες ίχνος επικοινωνίας.
            </p>
            <div className="mt-4 grid max-w-2xl grid-cols-3 gap-2 sm:gap-4">
              <StatPill label="Σύνολο" value={String(totalN)} sub="εγγραφές" color="text-[var(--accent-gold)]" border="border-[#C9A84C]/35" />
              <StatPill
                label="Ενεργές"
                value={String(activeN)}
                sub="εκκινισμένες"
                color="text-sky-200"
                border="border-sky-500/30"
              />
              <StatPill
                label="Ολοκληρώθηκαν"
                value={String(doneN)}
                sub="από το κέντρο"
                color="text-emerald-300/90"
                border="border-emerald-500/25"
              />
            </div>
          </div>
          <button
            type="button"
            className={goldBtnBase + " w-full min-w-0 sm:self-end sm:justify-end"}
            onClick={() => {
              setFormErr(null);
              setModal(true);
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span>Νέα Καμπάνια</span>
          </button>
        </div>
      </section>

      {loading && (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση καμπανιών…</p>
      )}

      {!loading && campaigns.length === 0 && (
        <p className="text-center text-sm text-[var(--text-secondary)]">Δεν έχετε ακόμα δημιουργήσει καμία καμπάνια.</p>
      )}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {campaigns.map((c) => {
          const isActive = c.status === "active";
          const s = c.stats;
          const hasPool = c.contactTotal > 0;
          const barPct = hasPool ? Math.min(100, c.progress) : s.total > 0 ? 100 : 0;
          return (
            <li
              key={c.id}
              className="group data-hq-card relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[#0F1E35] to-[#0A1628] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
            >
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/[0.04] to-transparent" aria-hidden />
              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-bold text-[var(--text-primary)]">{c.name}</h3>
                    <span
                      className={
                        statusStyle +
                        (isActive
                          ? " border border-sky-500/40 bg-sky-500/10 text-sky-200"
                          : " border border-stone-500/35 bg-stone-500/10 text-stone-200")
                      }
                    >
                      {isActive ? "Ενεργή" : "Ολοκληρώθηκε"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {c.created_at
                      ? new Date(c.created_at).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" })
                      : "—"}{" "}
                    {c.created_at ? "·" : null}{" "}
                    {c.started_at
                      ? `Έναρξη: ${new Date(c.started_at).toLocaleDateString("el-GR")}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-[#C9A84C]/25 bg-[#050D1A]">
                  <Megaphone className="h-4 w-4 text-[#C9A84C]" />
                </div>
              </div>

              {c.description && (
                <p className="relative mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">{c.description}</p>
              )}

              <div className="relative mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Πρόοδος {hasPool ? "επαφών" : ""}</span>
                  <span className="text-[var(--text-secondary)]">
                    {hasPool
                      ? `${c.callsMade} / ${c.contactTotal}`
                      : s.total
                        ? `${s.total} κλήση/εις (χωρίς αναλυτική δέσμευση περιοχών)`
                        : "0 / 0"}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#050D1A] ring-1 ring-[#C9A84C]/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#1e5fa8] via-[#C9A84C] to-[#2dd4bf]"
                    style={{ width: `${barPct}%`, transition: "width 0.2s ease" }}
                  />
                </div>
              </div>

              <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatBadge label="Σύνολο" value={s.total} className="text-[#F0F4FF]" bg="bg-slate-500/15" ring="ring-slate-500/20" />
                <StatBadge label="Θετικοί" value={s.positive} className="text-[#4ADE80]" bg="bg-emerald-500/10" ring="ring-emerald-500/20" />
                <StatBadge label="Αρνητικοί" value={s.negative} className="text-[#FB7185]" bg="bg-red-500/10" ring="ring-red-500/20" />
                <StatBadge label="Δεν Απάντησαν" value={s.noAnswer} className="text-amber-300" bg="bg-amber-500/10" ring="ring-amber-500/25" />
              </div>

              <div className="relative mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <Link
                  href={`/campaigns/${c.id}`}
                  className={lux.btnSecondary + " !min-h-11 w-full !justify-center sm:flex-1 sm:!w-auto sm:!shrink-0 sm:!px-3"}
                >
                  <FileText className="h-4 w-4 text-[var(--text-muted)]" />
                  Προβολή
                </Link>
                <button
                  type="button"
                  className={lux.btnPrimary + " !min-h-11 w-full !items-center !justify-center gap-2 !py-2.5 sm:!flex-1 sm:!w-auto sm:!shrink-0 sm:!px-2"}
                  disabled={dialingId === c.id || !isActive || !c.contactTotal}
                  title={!c.contactTotal ? "Δεν υπάρχει αναλυτική λίστα επαφών" : undefined}
                  onClick={async () => {
                    setDialingId(c.id);
                    setFormErr(null);
                    try {
                      const r = await fetch(`/api/campaigns/${c.id}/dial-next`, { method: "POST" });
                      const d = (await r.json().catch(() => ({}))) as { error?: string; contact_id?: string };
                      if (!r.ok) {
                        setFormErr(d.error ?? "Αποτυχία");
                        return;
                      }
                    } finally {
                      setDialingId(null);
                    }
                  }}
                >
                  {dialingId === c.id ? (
                    <span>Σύνδεση…</span>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      <span>Εκκίνηση Κλήσεων</span>
                    </>
                  )}
                </button>
                {isActive ? (
                  <button
                    type="button"
                    className={lux.btnSecondary + " !min-h-11 w-full !justify-center sm:min-w-0 sm:!flex-1 sm:!w-auto sm:!shrink-0 sm:!px-2"}
                    disabled={togglingId === c.id}
                    onClick={async () => {
                      setTogglingId(c.id);
                      try {
                        const r = await fetch(`/api/campaigns/${c.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "completed" }),
                        });
                        if (r.ok) void load();
                      } finally {
                        setTogglingId(null);
                      }
                    }}
                  >
                    {togglingId === c.id ? "…" : "Ολοκλ."}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={lux.btnSecondary + " !min-h-11 w-full !justify-center sm:min-w-0 sm:!flex-1 sm:!w-auto sm:!shrink-0 sm:!px-2"}
                    disabled={togglingId === c.id}
                    onClick={async () => {
                      setTogglingId(c.id);
                      try {
                        const r = await fetch(`/api/campaigns/${c.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "active" }),
                        });
                        if (r.ok) void load();
                      } finally {
                        setTogglingId(null);
                      }
                    }}
                  >
                    Επανενεργοποίηση
                  </button>
                )}
                <button
                  type="button"
                  className={lux.btnDanger + " !min-h-11 w-full !items-center !justify-center gap-2 !py-2.5 sm:!w-auto sm:!shrink-0 sm:!self-center sm:!px-2"}
                  disabled={deletingId === c.id}
                  onClick={async () => {
                    if (!confirm("Διαγραφή καμπάνιας; Δεν ανακαλείται.")) return;
                    setDeletingId(c.id);
                    setFormErr(null);
                    try {
                      const r = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
                      const d = (await r.json().catch(() => ({}))) as { error?: string };
                      if (!r.ok) {
                        setFormErr(d.error ?? "Σφάλμα διαγραφής");
                        return;
                      }
                      await load();
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingId === c.id ? "—" : "Διαγραφή"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {formErr && !modal && (
        <p className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-500/40 bg-[#0A1628] px-4 py-2 text-sm text-red-200 shadow-xl max-md:bottom-28" role="alert">
          {formErr}
        </p>
      )}

      {modal && (
        <div className={lux.modalOverlay + " !z-50 !items-stretch !p-0 sm:!items-center sm:!p-4"} onClick={() => setModal(false)}>
          <form
            className={lux.modalPanel + " flex w-full !max-w-[720px] flex-1 !flex-col overflow-hidden sm:!max-h-[min(100dvh,90vh)]"}
            onClick={(e) => e.stopPropagation()}
            onSubmit={createCampaign}
          >
            <div className="mx-auto mt-2 h-1 w-11 rounded-full bg-white/20 sm:hidden" aria-hidden />
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 px-5 py-4">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Νέα Καμπάνια</h2>
              <p className="text-xs text-[var(--text-muted)]">Όνομα, περιγραφή και ποιες επαφές θα τρέχουν (φίλτρα).</p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {formErr && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{formErr}</p>
              )}

              <div>
                <label className={lux.label} htmlFor="c-name">Όνομα</label>
                <input
                  id="c-name"
                  className={lux.input + " !text-base"}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="π.χ. Θερινή εξόρμηση 2025"
                />
              </div>
              <div>
                <label className={lux.label} htmlFor="c-desc">Περιγραφή (προαιρετική)</label>
                <textarea
                  id="c-desc"
                  className={lux.textarea + " !min-h-[88px] !text-base"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <p className="text-xs font-medium uppercase tracking-wider text-[#C9A84C]">Φιλτράρισμα επαφών</p>
              <p className="text-[11px] text-[var(--text-muted)]">Χρειάζεται τουλάχιστον ένα κριτήριο.</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={lux.label} htmlFor="c-st">Κατάσταση κλήσης</label>
                  <select
                    id="c-st"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.call_status}
                    onChange={(e) => setFilter((f) => ({ ...f, call_status: e.target.value }))}
                  >
                    <option value="">Όλες</option>
                    <option value="Pending">Αναμονή</option>
                    <option value="Positive">Θετική</option>
                    <option value="Negative">Αρνητική</option>
                    <option value="No Answer">Δεν απάντησε</option>
                  </select>
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-pri">Προτεραιότητα</label>
                  <select
                    id="c-pri"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.priority}
                    onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="">Όλες</option>
                    <option value="High">Υψηλή</option>
                    <option value="Medium">Μεσαία</option>
                    <option value="Low">Χαμηλή</option>
                  </select>
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-area">Περιοχή</label>
                  <select
                    id="c-area"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.area}
                    onChange={(e) => setFilter((f) => ({ ...f, area: e.target.value }))}
                  >
                    <option value="">Όλες</option>
                    {(options?.areas ?? []).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lux.label} htmlFor="c-mun">Δήμος (περίπου)</label>
                  <select
                    id="c-mun"
                    className={lux.select + " !min-h-11 !text-base"}
                    value={filter.municipality}
                    onChange={(e) => setFilter((f) => ({ ...f, municipality: e.target.value }))}
                  >
                    <option value="">Όλοι</option>
                    {(options?.municipalities ?? []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={lux.label} htmlFor="c-tag">Ετικέτα (ακριβές tag)</label>
                  <div className="relative">
                    <input
                      id="c-tag"
                      className={lux.input + " !text-base !pl-9"}
                      value={filter.tag}
                      onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))}
                    />
                    <LayoutGrid className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  </div>
                </div>
              </div>

              <div
                className="flex items-center justify-between gap-2 rounded-xl border border-[#C9A84C]/25 bg-[#050D1A]/60 px-4 py-3"
                role="status"
                aria-live="polite"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C9A84C]/15 text-[#C9A84C]">
                    <Search className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C]">Προεπισκόπηση</p>
                    <p className="text-sm text-[var(--text-primary)]">Επαφές που ταιριάζουν</p>
                  </div>
                </div>
                <p className="shrink-0 text-2xl font-bold text-[#C9A84C] tabular-nums sm:text-3xl">
                  {previewing || previewCount == null ? "—" : previewCount}
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-[var(--border)] bg-[#050D1A]/50 px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
                <button type="button" className={lux.btnSecondary + " !min-h-11 w-full !justify-center sm:w-auto"} onClick={() => setModal(false)} disabled={saving}>
                  Άκυρο
                </button>
                <button
                  type="submit"
                  className={goldBtnBase + " !h-12 !w-full !rounded-xl sm:!w-auto !min-w-0"}
                  disabled={saving}
                >
                  {saving ? "…" : "Δημιουργία"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, sub, color, border }: { label: string; value: string; sub: string; color: string; border: string }) {
  return (
    <div className={["rounded-lg border", border, "bg-[#0A1628]/80 p-2.5 sm:p-3"].join(" ")}>
      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-subtitle)]">{label}</p>
      <p className={["mt-0.5 text-xl font-bold tabular-nums sm:text-2xl", color].join(" ")}>{value}</p>
      <p className="text-[9px] text-[var(--text-subtitle)] sm:text-[10px]">{sub}</p>
    </div>
  );
}

function StatBadge({
  label,
  value,
  className: cls,
  bg,
  ring,
}: {
  label: string;
  value: number;
  className: string;
  bg: string;
  ring: string;
}) {
  return (
    <div className={["flex flex-col rounded-lg p-1.5 ring-1 sm:p-2", bg, ring, "min-h-[2.5rem] justify-center"].join(" ")}>
      <span className="text-[9px] font-semibold leading-tight text-[var(--text-subtitle)]">{label}</span>
      <span className={["text-sm font-bold tabular-nums sm:text-base", cls].join(" ")}>{value}</span>
    </div>
  );
}
