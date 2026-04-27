"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";

type C = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  area: string | null;
  municipality: string | null;
};

type DupPair = { contactA: C; contactB: C; score: number; reasons: string[] };

export default function DataToolsPage() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [tab, setTab] = useState<"dup" | "phone" | "stats" | "export" | "predict">("dup");
  const [predLoading, setPredLoading] = useState(false);
  const [predList, setPredList] = useState<
    | {
        rank: number;
        contact_id: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        municipality: string | null;
        score: number;
        breakdown: { points: number; reason: string }[];
      }[]
    | null
  >(null);
  const [dups, setDups] = useState<DupPair[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [phoneAudit, setPhoneAudit] = useState<{
    empty: C[];
    invalid: Array<C & { problem: string }>;
    phoneDuplicates: Array<{ normalized: string; contacts: C[] }>;
  } | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    noPhone: number;
    noMuni: number;
    noCallStatus: number;
    thisMonth: number;
    byStatus: Record<string, number>;
    byStance: Record<string, number>;
    topArea: Array<{ label: string; type: string; count: number }>;
    topMunicipalities: Array<{ label: string; type: string; count: number }>;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<DupPair | null>(null);
  const [keepSide, setKeepSide] = useState<"a" | "b">("a");
  const [scoring, setScoring] = useState(false);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);

  const runDup = useCallback(async () => {
    setScanning(true);
    setDups(null);
    try {
      const res = await fetchWithTimeout("/api/data-tools/duplicates/scan", { method: "POST" });
      const data = await res.json();
      setDups((data.pairs as DupPair[]) ?? []);
    } catch {
      setDups([]);
    } finally {
      setScanning(false);
    }
  }, []);

  const runPhone = useCallback(async () => {
    setPhoneLoading(true);
    setPhoneAudit(null);
    try {
      const res = await fetchWithTimeout("/api/data-tools/phone-audit");
      setPhoneAudit(await res.json());
    } catch {
      setPhoneAudit({ empty: [], invalid: [], phoneDuplicates: [] });
    } finally {
      setPhoneLoading(false);
    }
  }, []);

  const runStats = useCallback(async () => {
    setStatsLoading(true);
    setStats(null);
    try {
      const res = await fetchWithTimeout("/api/data-tools/stats");
      setStats(await res.json());
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const runPredictedScores = useCallback(async () => {
    setScoreMsg(null);
    setScoring(true);
    try {
      const res = await fetchWithTimeout("/api/contacts/calculate-scores", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; updated?: number; total?: number };
      if (!res.ok) {
        setScoreMsg(j.error ?? "Σφάλμα");
        return;
      }
      setScoreMsg(
        `Ενημερώθηκαν ${typeof j.updated === "number" ? j.updated : 0} από ${typeof j.total === "number" ? j.total : "?"} επαφές.`,
      );
    } catch {
      setScoreMsg("Σφάλμα δικτύου");
    } finally {
      setScoring(false);
    }
  }, []);

  const dismissPair = async (a: C, b: C) => {
    await fetchWithTimeout("/api/data-tools/duplicates/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId1: a.id, contactId2: b.id }),
    });
    setDups((list) => (list ?? []).filter((p) => !(p.contactA.id === a.id && p.contactB.id === b.id)));
  };

  const familyPair = async (a: C, b: C) => {
    await fetchWithTimeout("/api/data-tools/duplicates/family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId1: a.id, contactId2: b.id }),
    });
    setDups((list) => (list ?? []).filter((p) => !(p.contactA.id === a.id && p.contactB.id === b.id)));
  };

  const doMerge = async () => {
    if (!mergeTarget) return;
    const { contactA, contactB } = mergeTarget;
    const keepId = keepSide === "a" ? contactA.id : contactB.id;
    const mergeId = keepSide === "a" ? contactB.id : contactA.id;
    await fetchWithTimeout("/api/data-tools/duplicates/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId, mergeId }),
    });
    setMergeTarget(null);
    setDups((list) =>
      (list ?? []).filter(
        (p) =>
          !(
            (p.contactA.id === contactA.id && p.contactB.id === contactB.id) ||
            (p.contactA.id === contactB.id && p.contactB.id === contactA.id)
          ),
      ),
    );
  };

  if (!can) {
    return (
      <p className="rounded-[12px] border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100/95">Δεν έχετε πρόσβαση.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className={lux.card}>
        <h1 className={lux.pageTitle}>Εργαλεία δεδομένων</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Έλεγχος ποιότητας, διπλοτύπων και στατιστικών (προτεινόμενο μόνον — αποφασίζετε εσείς)</p>
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Υπολογισμός σκορ πειθώ (0–100)</p>
            <p className="text-xs text-[var(--text-secondary)]">Βασίζεται σε κατάσταση κλήσης, πολιτική στάση, τηλέφωνο, επιρροή, ηλικία και εκλογικά δεδομένα ΝΔ ανά δήμο.</p>
            {scoreMsg && <p className="mt-1 text-xs text-[var(--accent-gold)]">{scoreMsg}</p>}
          </div>
          <button
            type="button"
            className={lux.btnPrimary + " shrink-0 !py-2.5"}
            disabled={scoring}
            onClick={() => void runPredictedScores()}
          >
            {scoring ? "Υπολογισμός…" : "Υπολογισμός σκορ"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
          {(
            [
              { id: "dup" as const, label: "Διπλότυπα" },
              { id: "phone" as const, label: "Έλεγχος τηλεφώνων" },
              { id: "stats" as const, label: "Στατιστικά βάσης" },
              { id: "export" as const, label: "Εξαγωγή & Backup" },
              { id: "predict" as const, label: "Έξυπνη λίστα κλήσεων" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150",
                tab === t.id
                  ? "bg-[#003476] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "dup" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void runDup()}
            className={lux.btnPrimary}
            disabled={scanning}
          >
            {scanning ? "Έλεγχος…" : "Εκκίνηση ελέγχου"}
          </button>
          {dups === null && <p className="text-sm text-[var(--text-secondary)]">Πατήστε εκκίνηση για αναζήτηση (σκορ ≥ 50).</p>}
          {dups && dups.length === 0 && <p className="text-sm text-[#16A34A]">Δεν βρέθηκαν ύποπτα ζεύγη.</p>}
          {dups &&
            dups.length > 0 &&
            dups.map((p) => (
              <div
                key={`${p.contactA.id}-${p.contactB.id}`}
                className="grid gap-4 rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] md:grid-cols-2"
              >
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-secondary)]">Επαφή Α</p>
                  <CardSide c={p.contactA} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-secondary)]">Επαφή Β</p>
                  <CardSide c={p.contactB} />
                </div>
                <div className="md:col-span-2 flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#C9A84C]/50 bg-[#C9A84C]/10 px-2.5 py-0.5 text-xs font-bold text-[#0A1628]">
                      Σκορ: {p.score}/100
                    </span>
                    {p.reasons.map((r) => (
                      <span key={r} className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={lux.btnPrimary + " !py-2 text-xs"}
                      onClick={() => {
                        setKeepSide("a");
                        setMergeTarget(p);
                      }}
                    >
                      Συγχώνευση
                    </button>
                    <button
                      type="button"
                      className={lux.btnGold + " !py-2 text-xs"}
                      onClick={() => void familyPair(p.contactA, p.contactB)}
                    >
                      Οικογένεια
                    </button>
                    <button
                      type="button"
                      className={lux.btnSecondary + " !py-2 text-xs"}
                      onClick={() => void dismissPair(p.contactA, p.contactB)}
                    >
                      Αγνόησε
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {tab === "phone" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void runPhone()}
            className={lux.btnPrimary}
            disabled={phoneLoading}
          >
            {phoneLoading ? "Έλεγχος…" : "Εκκίνηση ελέγχου"}
          </button>
          {phoneAudit && (
            <div className="space-y-6">
              {phoneAudit.empty.length > 0 && (
                <section className={lux.card + " !shadow-sm"}>
                  <h2 className={lux.sectionTitle + " mb-3"}>Κενός αριθμός</h2>
                  <ul className="space-y-2">
                    {phoneAudit.empty.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
                      >
                        <span>
                          {c.first_name} {c.last_name}
                        </span>
                        <Link href={`/contacts/${c.id}`} className={lux.btnSecondary + " !py-1.5 !text-xs"}>
                          Επεξεργασία
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {phoneAudit.invalid.length > 0 && (
                <section className={lux.card + " !shadow-sm"}>
                  <h2 className={lux.sectionTitle + " mb-3"}>Μη έγκυρα τηλέφωνα</h2>
                  <ul className="space-y-2">
                    {phoneAudit.invalid.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-[#E2E8F0]"
                      >
                        <span>
                          {c.first_name} {c.last_name} — <em>{c.problem}</em>
                        </span>
                        <Link href={`/contacts/${c.id}`} className={lux.btnSecondary + " !py-1.5 !text-xs"}>
                          Επεξεργασία
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {phoneAudit.phoneDuplicates.length > 0 && (
                <section className={lux.card + " !shadow-sm"}>
                  <h2 className={lux.sectionTitle + " mb-3"}>Ίδιος αριθμός (2+ επαφές)</h2>
                  {phoneAudit.phoneDuplicates.map((g) => (
                    <div key={g.normalized} className="mb-4 last:mb-0">
                      <p className="mb-2 text-xs text-[var(--text-secondary)]">Νούμερο: {g.normalized}</p>
                      <ul className="space-y-1">
                        {g.contacts.map((c) => (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-2 py-1.5"
                          >
                            {c.first_name} {c.last_name}
                            <Link href={`/contacts/${c.id}`} className="text-xs font-medium text-[#003476] hover:underline">
                              Άνοιγμα
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void runStats()}
            className={lux.btnPrimary}
            disabled={statsLoading}
          >
            {statsLoading ? "Φόρτωση…" : "Ανανέωση στατιστικών"}
          </button>
          {stats && (
            <div className="grid gap-4 md:grid-cols-2">
              <StatBox label="Σύνολο επαφών" value={stats.total} />
              <StatBox label="Χωρίς τηλέφωνο" value={stats.noPhone} />
              <StatBox label="Χωρίς δήμο" value={stats.noMuni} />
              <StatBox label="Χωρίς κατάσταση κλήσης" value={stats.noCallStatus} />
              <StatBox label="Προσθήκες μήνα" value={stats.thisMonth} />
              <div className={lux.card + " !shadow-sm md:col-span-2"}>
                <h2 className={lux.sectionTitle + " mb-3"}>Κατάσταση κλήσης</h2>
                <BarList data={stats.byStatus} color="bg-[#003476]" />
              </div>
              <div className={lux.card + " !shadow-sm md:col-span-2"}>
                <h2 className={lux.sectionTitle + " mb-3"}>Πολιτική τοποθέτηση</h2>
                <BarList data={stats.byStance} color="bg-[#C9A84C]" />
              </div>
              <div className={lux.card + " !shadow-sm md:col-span-2"}>
                <h2 className={lux.sectionTitle + " mb-3"}>Κορυφαίες περιοχές</h2>
                <TopTable rows={stats.topArea} />
              </div>
              <div className={lux.card + " !shadow-sm md:col-span-2"}>
                <h2 className={lux.sectionTitle + " mb-3"}>Κορυφαίοι δήμοι</h2>
                <TopTable rows={stats.topMunicipalities} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "export" && (
        <div className={lux.card + " space-y-4"}>
          <h2 className={lux.sectionTitle}>Εξαγωγή &amp; backup</h2>
          <p className="text-sm text-[var(--text-secondary)]">Κατέβασμα XLSX / ZIP. Το εβδομαδιαίο αυτόματο αποστέλλεται από το cron (Vercel) στο ADMIN_EMAIL.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href="/api/export/contacts" className={lux.btnPrimary + " text-center !no-underline"} download>
              Εξαγωγή επαφών (Excel)
            </a>
            <a href="/api/export/requests" className={lux.btnSecondary + " text-center !no-underline"} download>
              Εξαγωγή αιτημάτων (Excel)
            </a>
            <a href="/api/export/full-backup" className={lux.btnGold + " text-center !no-underline"} download>
              Πλήρες backup (ZIP)
            </a>
          </div>
        </div>
      )}

      {tab === "predict" && (
        <div className={lux.card + " space-y-4"}>
          <h2 className={lux.sectionTitle}>Έξυπνη λίστα κλήσεων (σήμερα)</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Σκορ βάσει γιορτής, προτεραιότητας, ιστορικού κλήσεων και κατάστασης. Αποθηκεύεται στη βάση.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={lux.btnPrimary}
              disabled={predLoading}
              onClick={async () => {
                setPredLoading(true);
                const r = await fetchWithTimeout("/api/data-tools/predictive-list", { method: "POST" });
                const j = (await r.json().catch(() => ({}))) as { list?: typeof predList };
                if (r.ok) {
                  setPredList(j.list ?? []);
                }
                setPredLoading(false);
              }}
            >
              {predLoading ? "…" : "Δημιουργία λίστας"}
            </button>
            <button
              type="button"
              className={lux.btnSecondary}
              onClick={async () => {
                const r = await fetchWithTimeout("/api/data-tools/predictive-list");
                const j = (await r.json().catch(() => ({}))) as { list?: typeof predList };
                if (r.ok) {
                  setPredList(j.list ?? []);
                }
              }}
            >
              Φόρτωση σημερινής
            </button>
          </div>
          {predList && predList.length > 0 ? (
            <ul className="space-y-3">
              {predList.map((row) => (
                <li key={row.contact_id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      #{row.rank} {row.first_name} {row.last_name} · {row.phone ?? "—"} · {row.municipality ?? "—"}
                    </span>
                    <span className="text-[var(--accent-gold)]">Σκορ: {row.score}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {row.breakdown.map((b) => `${b.reason} (${b.points > 0 ? "+" : ""}${b.points})`).join(" · ")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={lux.btnPrimary + " !py-1.5 !text-xs"}
                      onClick={() =>
                        void fetchWithTimeout("/api/retell/call", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contact_id: row.contact_id }),
                        })
                      }
                    >
                      Κλήση
                    </button>
                    <button
                      type="button"
                      className={lux.btnSecondary + " !py-1.5 !text-xs"}
                      onClick={async () => {
                        await fetchWithTimeout("/api/data-tools/predictive-list/skip", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contact_id: row.contact_id }),
                        });
                        setPredList((p) => (p ?? []).filter((x) => x.contact_id !== row.contact_id));
                      }}
                    >
                      Παράλειψη
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Καμία λίστα — πατήστε δημιουργία.</p>
          )}
        </div>
      )}

      {mergeTarget && (
        <div
          className={lux.modalOverlay}
          onClick={() => setMergeTarget(null)}
          onKeyDown={(e) => e.key === "Escape" && setMergeTarget(null)}
          role="presentation"
        >
          <div
            className={lux.modalPanel + " max-w-md space-y-4 p-6"}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-labelledby="merge-modal-title"
          >
            <h3 id="merge-modal-title" className="text-lg font-bold text-[var(--text-primary)]">
              Συγχώνευση
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">Ποια εγγραφή να κρατήσουμε; (οι κλήσεις, tasks και αιτήματα μεταφέρονται)</p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-2">
                <input type="radio" name="k" checked={keepSide === "a"} onChange={() => setKeepSide("a")} />
                <span>
                  {mergeTarget.contactA.first_name} {mergeTarget.contactA.last_name}
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-2">
                <input type="radio" name="k" checked={keepSide === "b"} onChange={() => setKeepSide("b")} />
                <span>
                  {mergeTarget.contactB.first_name} {mergeTarget.contactB.last_name}
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={lux.btnSecondary} onClick={() => setMergeTarget(null)}>
                Άκυρο
              </button>
              <button type="button" className={lux.btnPrimary} onClick={() => void doMerge()}>
                Συγχώνευση
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardSide({ c }: { c: C }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
      <p className="font-semibold text-[var(--text-primary)]">
        {c.first_name} {c.last_name}
      </p>
      <p className="mt-1 font-mono text-[var(--text-secondary)]">{c.phone ?? "—"}</p>
      <p className="text-[var(--text-secondary)]">Περιοχή: {c.area ?? "—"}</p>
      <p className="text-[var(--text-secondary)]">Δήμος: {c.municipality ?? "—"}</p>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className={lux.card + " !p-4 !shadow-sm"}>
      <p className="text-xs font-medium uppercase text-[var(--text-secondary)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function BarList({ data, color }: { data: Record<string, number>; color: string }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">Καμία εγγραφή.</p>;
  }
  return (
    <ul className="space-y-2">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <li key={k}>
            <div className="mb-0.5 flex justify-between text-xs text-[var(--text-secondary)]">
              <span className="truncate pr-2">{k}</span>
              <span>{v}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
              <div className={`h-2 rounded-full ${color}`} style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        ))}
    </ul>
  );
}

function TopTable({ rows }: { rows: Array<{ label: string; type: string; count: number }> }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">—</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--text-secondary)]">
          <th className="pb-2">Τύπος</th>
          <th className="pb-2">Όνομα</th>
          <th className="pb-2">Αριθμός</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-[var(--border)]">
            <td className="py-2 pr-2">{r.type}</td>
            <td className="py-2 pr-2">{r.label}</td>
            <td className="py-2 font-medium">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
