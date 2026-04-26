"use client";

import { ArrowLeft, FileText, Phone, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { lux } from "@/lib/luxury-styles";

type OutcomeStats = { total: number; positive: number; negative: number; noAnswer: number };

type CallRow = {
  id: string;
  called_at: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  transferred_to_politician: boolean | null;
  contact_id: string;
  contacts: { first_name: string; last_name: string; phone: string } | null;
};

type HeadData = {
  campaign: { id: string; name: string; created_at: string | null; started_at: string | null; description: string | null; status: string };
  stats: OutcomeStats;
  progress: number;
  callsMade: number;
  contactTotal: number;
  calls: CallRow[];
};

function formatDuration(s: number | null | undefined): string {
  if (s == null || s < 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function outcomeGreek(o: string | null | undefined): string {
  const t = o ?? "—";
  const m: Record<string, string> = {
    Positive: "Θετικό",
    Negative: "Αρνητικό",
    "No Answer": "Δεν απάντησε",
    Pending: "Αναμονή",
  };
  return m[t] ?? t;
}

const tableTh = "text-left text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]";

export default function CampaignDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [data, setData] = useState<HeadData | null>(null);
  const [outcome, setOutcome] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialing, setDialing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (outcome) q.set("outcome", outcome);
      const res = await fetch(`/api/campaigns/${id}?${q.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setErr((j as { error?: string }).error ?? "Σφάλμα");
        setData(null);
        return;
      }
      setData({
        campaign: j.campaign,
        stats: j.stats,
        progress: j.progress,
        callsMade: j.callsMade,
        contactTotal: j.contactTotal,
        calls: (j.calls ?? []) as CallRow[],
      });
    } finally {
      setLoading(false);
    }
  }, [id, outcome]);

  useEffect(() => {
    void load();
  }, [load]);

  const c = data?.campaign;
  const s = data?.stats;
  const hasPool = (data?.contactTotal ?? 0) > 0;
  const barPct = hasPool ? Math.min(100, data?.progress ?? 0) : (s?.total ?? 0) > 0 ? 100 : 0;

  if (!id) {
    return <p className="text-sm text-[var(--text-secondary)]">Μη έγκυρο id.</p>;
  }

  return (
    <div className="space-y-6 max-md:space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href="/campaigns"
            className="mb-2 inline-flex h-9 min-w-0 items-center gap-1.5 text-xs font-medium text-[#C9A84C] transition hover:text-[#E8C96B]"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            Καμπάνιες
          </Link>
          {c ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{c.name}</h1>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {c.status === "active" ? "Ενεργή" : "Ολοκληρώθηκε"}{" "}
                {c.description ? `· ${c.description}` : null}
              </p>
            </>
          ) : (
            <h1 className="text-xl text-[var(--text-muted)]">{loading ? "Φόρτωση…" : "—"}</h1>
          )}
        </div>
        <button
          type="button"
          className={lux.btnPrimary + " !h-10 !shrink-0 !gap-2 !px-3 !py-2 !text-sm"}
          disabled={dialing || !c || c.status !== "active" || !data?.contactTotal}
          onClick={async () => {
            if (!id) return;
            setDialing(true);
            setErr(null);
            try {
              const r = await fetch(`/api/campaigns/${id}/dial-next`, { method: "POST" });
              const j = (await r.json().catch(() => ({}))) as { error?: string };
              if (!r.ok) {
                setErr(j.error ?? "Σφάλμα");
                return;
              }
              void load();
            } finally {
              setDialing(false);
            }
          }}
        >
          {dialing ? (
            "Σύνδεση…"
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Εκκίνηση Κλήσεων
            </>
          )}
        </button>
      </div>

      {err && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>}

      {c && s && data && (
        <section
          className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-4 shadow-[0_4px_32px_rgba(0,0,0,0.45)] sm:p-5"
          style={{
            background: "linear-gradient(165deg, #0F1E35 0%, #050D1A 100%)",
          }}
        >
          <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 bg-[#C9A84C]/5 blur-3xl" />
          <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiBox label="Σημειώθηκαν" value={String(s.total)} sub="κλήση/εις" color="text-[#E2E8F0]" border="border-slate-500/20" />
            <KpiBox label="Θετικοί" value={String(s.positive)} sub="αποτέλεσμα" color="text-emerald-300" border="border-emerald-500/20" />
            <KpiBox label="Αρνητικοί" value={String(s.negative)} sub="αποτέλεσμα" color="text-rose-300" border="border-rose-500/20" />
            <KpiBox label="Δεν Απάντησαν" value={String(s.noAnswer)} sub="αποτέλεσμα" color="text-amber-200" border="border-amber-500/20" />
            <div className="col-span-1 sm:col-span-2 lg:col-span-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#C9A84C]">Λίστα επαφών</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">
                {data.callsMade} <span className="text-sm font-normal text-[var(--text-muted)]">/ {data.contactTotal || "—"}</span>
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#050D1A] ring-1 ring-[#C9A84C]/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1e5fa8] to-[#C9A84C]"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {c && (
        <p className="text-xs text-[var(--text-muted)]">
          Δημιουργήθηκε: {c.created_at ? new Date(c.created_at).toLocaleString("el-GR") : "—"}{" "}
          {c.started_at ? `· Έναρξη: ${new Date(c.started_at).toLocaleString("el-GR")}` : ""}
        </p>
      )}

      <div className={lux.card + " !p-0 !overflow-hidden"}>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Καταγεγραμμένες κλήσεις</h2>
            <p className="text-[10px] text-[var(--text-secondary)]">Φίλτρα με βάση το αποτέλεσμα.</p>
          </div>
          <div className="flex w-full min-w-0 max-w-sm flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <label className="sr-only" htmlFor="out-camp">Αποτέλεσμα</label>
              <select
                id="out-camp"
                className={lux.select + " w-full !text-base !min-h-11 max-md:!text-base"}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="">Όλα</option>
                <option value="Positive">Θετικό</option>
                <option value="Negative">Αρνητικό</option>
                <option value="No Answer">Δεν απάντησε</option>
              </select>
            </div>
            <button
              type="button"
              className={lux.btnSecondary + " !min-h-11 w-full !justify-center gap-2 !py-2 sm:w-auto sm:!shrink-0 sm:!self-end"}
              onClick={() => void load()}
            >
              <RefreshCw className="h-4 w-4" />
              Αναν.
            </button>
          </div>
        </div>
        {loading && !data ? (
          <p className="p-6 text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
        ) : (
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full min-w-[720px] text-sm text-[var(--text-primary)]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/60">
                  <th className={`p-2 pl-3 sm:p-3 ${tableTh} sm:pl-4`}>Επαφή</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Τηλέφωνο</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Αποτέλεσμα</th>
                  <th className={`p-2 sm:p-3 ${tableTh}`}>Διάρκεια</th>
                  <th className={`p-2 pr-3 sm:p-3 sm:pr-4 ${tableTh} text-left`}>Χρόνος</th>
                  <th className={`p-2 pr-3 sm:p-3 sm:pr-4 text-right ${tableTh}`}>Κατάσταση</th>
                </tr>
              </thead>
              <tbody>
                {(data?.calls ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[var(--text-secondary)]">
                      Δεν βρέθηκαν εγγραφές κλήσεων{outcome ? " γι’ αυτό το φίλτρο" : ""}.
                    </td>
                  </tr>
                ) : (
                  (data?.calls ?? []).map((call) => {
                    const n = call.contacts;
                    const out = call.outcome;
                    return (
                      <tr key={call.id} className="border-b border-[var(--border)]/80 last:border-0">
                        <td className="p-2 pl-3 sm:max-w-[14rem] sm:min-w-0 sm:p-3 sm:pl-4">
                          <div className="font-semibold text-[var(--text-primary)] break-words">
                            {n ? [n.first_name, n.last_name].filter(Boolean).join(" ") : "—"}
                          </div>
                          <Link
                            className="mt-0.5 text-[10px] text-[#1e5fa8] hover:underline"
                            href={`/contacts/${call.contact_id}`}
                          >
                            Προφίλ
                          </Link>
                        </td>
                        <td className="whitespace-nowrap p-2 font-mono text-[12px] text-[var(--text-secondary)] sm:p-3">
                          {n?.phone ? (
                            <a
                              className="hover:text-[#C9A84C] hover:underline"
                              href={`tel:${n.phone}`}
                            >
                              {n.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2 sm:p-3">
                          <OutcomePill o={out} />
                        </td>
                        <td className="whitespace-nowrap p-2 text-[13px] text-[var(--text-primary)] sm:p-3">
                          {formatDuration(call.duration_seconds ?? null)}
                        </td>
                        <td className="p-2 pr-3 sm:p-3 sm:pr-4 text-left text-xs text-[var(--text-secondary)] sm:text-sm">
                          {call.called_at ? new Date(call.called_at).toLocaleString("el-GR") : "—"}
                        </td>
                        <td className="p-2 pr-3 sm:p-3 sm:pr-4 text-right">
                          {call.transferred_to_politician ? (
                            <span
                              className="inline-flex items-center justify-end gap-1 text-[9px] font-bold uppercase text-[#C9A84C] sm:text-[10px] sm:leading-tight"
                              title="Έγινε transfer"
                            >
                              <Phone className="h-2.5 w-2.5" />
                              Transfer
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center justify-end gap-1 text-[9px] font-semibold uppercase text-[var(--text-muted)] sm:text-[10px] sm:leading-tight"
                              title="Άμεση κλήση / χωρίς transfer"
                            >
                              <FileText className="h-2.5 w-2.5 opacity-50" />
                              <span>—</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiBox({ label, value, sub, color, border }: { label: string; value: string; sub: string; color: string; border: string }) {
  return (
    <div className={["rounded-lg border p-2.5 sm:p-3", border, "bg-[#050D1A]/30"].join(" ")}>
      <p className="text-[8px] font-bold uppercase leading-tight tracking-wider text-[var(--text-muted)] sm:text-[9px] sm:leading-tight sm:tracking-widest">{label}</p>
      <p className={["mt-0.5 text-xl font-bold sm:text-2xl", color].join(" ")}>{value}</p>
      <p className="text-[8px] text-[var(--text-muted)] sm:text-[9px] sm:leading-tight">{sub}</p>
    </div>
  );
}

function OutcomePill({ o }: { o: string | null }) {
  const t = o ?? "—";
  const map: Record<string, { bg: string; text: string; ring: string }> = {
    Positive: { bg: "bg-emerald-500/15", text: "text-emerald-200", ring: "ring-emerald-500/25" },
    Negative: { bg: "bg-rose-500/15", text: "text-rose-200", ring: "ring-rose-500/25" },
    "No Answer": { bg: "bg-amber-500/15", text: "text-amber-200", ring: "ring-amber-500/25" },
  };
  const c = map[t] ?? { bg: "bg-slate-500/10", text: "text-[#E2E8F0]", ring: "ring-slate-500/20" };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c.bg} ${c.text} ${c.ring} max-w-full`}>
      {outcomeGreek(t === "—" ? null : t)}
    </span>
  );
}
