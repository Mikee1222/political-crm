"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { Copy, Download, Phone, Sparkles } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { useProfile } from "@/contexts/profile-context";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { useFormToast } from "@/contexts/form-toast-context";
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

type ToolId = "dup" | "phone" | "predict" | "export";

const GOLD_ICON =
  "flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E8C96B] via-[#C9A84C] to-[#8b6914] text-[#0A1628] shadow-[0_8px_28px_rgba(201,168,76,0.35)] ring-2 ring-white/10";

export default function DataToolsPage() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [activeTool, setActiveTool] = useState<ToolId>("dup");
  const [resultsOpen, setResultsOpen] = useState(true);

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
  const [mergeTarget, setMergeTarget] = useState<DupPair | null>(null);
  const [keepSide, setKeepSide] = useState<"a" | "b">("a");
  const [mergeBusy, setMergeBusy] = useState(false);
  const { showToast } = useFormToast();
  const [scoring, setScoring] = useState(false);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);

  const runDup = useCallback(async () => {
    setActiveTool("dup");
    setResultsOpen(true);
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
    setActiveTool("phone");
    setResultsOpen(true);
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
    setMergeBusy(true);
    try {
      const res = await fetchWithTimeout("/api/data-tools/duplicates/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeId }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Αποτυχία συγχώνευσης", "error");
        return;
      }
      showToast("Η συγχώνευση ολοκληρώθηκε.", "success");
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
    } catch {
      showToast("Σφάλμα δικτύου.", "error");
    } finally {
      setMergeBusy(false);
    }
  };

  if (!can) {
    return (
      <p className="rounded-[12px] border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100/95">Δεν έχετε πρόσβαση.</p>
    );
  }

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <header className="max-w-3xl">
        <h1 className={lux.pageTitle}>Εργαλεία δεδομένων</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Έλεγχος ποιότητας, διπλοτύπων και λιστών κλήσεων. Οι ενέργειες είναι προτεινόμενες — αποφασίζετε εσείς.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <ToolCard
          title="Διπλότυπα"
          description="Σάρωση CRM για ύποπτα ζεύγη (σκορ ≥ 50). Συγχώνευση, οικογένεια ή αγνόηση."
          icon={<Copy className="h-9 w-9" strokeWidth={2} />}
          active={activeTool === "dup"}
          onOpen={() => {
            setActiveTool("dup");
            setResultsOpen(true);
          }}
          actionLabel={scanning ? "Έλεγχος…" : "Έλεγχος διπλοτύπων"}
          onAction={() => void runDup()}
          busy={scanning}
        />
        <ToolCard
          title="Τηλέφωνα"
          description="Κενά, μη έγκυρα και διπλά νούμερα ανά επαφή."
          icon={<Phone className="h-9 w-9" strokeWidth={2} />}
          active={activeTool === "phone"}
          onOpen={() => {
            setActiveTool("phone");
            setResultsOpen(true);
          }}
          actionLabel={phoneLoading ? "Έλεγχος…" : "Έλεγχος τηλεφώνων"}
          onAction={() => void runPhone()}
          busy={phoneLoading}
        />
        <ToolCard
          title="Προβλεπτική λίστα"
          description="Λίστα κλήσεων σήμερα με σκορ. Υπολογισμός σκορ πειθούς (0–100) πριν την κλήση."
          icon={<Sparkles className="h-9 w-9" strokeWidth={2} />}
          active={activeTool === "predict"}
          onOpen={() => {
            setActiveTool("predict");
            setResultsOpen(true);
          }}
          actionLabel="Άνοιγμα αποτελεσμάτων"
          onAction={() => {
            setActiveTool("predict");
            setResultsOpen(true);
          }}
        />
        <ToolCard
          title="Εξαγωγή"
          description="Excel επαφές / αιτήματα και πλήρες ZIP backup."
          icon={<Download className="h-9 w-9" strokeWidth={2} />}
          active={activeTool === "export"}
          onOpen={() => {
            setActiveTool("export");
            setResultsOpen(true);
          }}
          actionLabel="Εμφάνιση συνδέσμων"
          onAction={() => {
            setActiveTool("export");
            setResultsOpen(true);
          }}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition hover:bg-[var(--bg-elevated)]/40 sm:px-6"
          onClick={() => setResultsOpen((o) => !o)}
          aria-expanded={resultsOpen}
        >
          <span className="text-sm font-bold text-[var(--text-primary)]">
            Αποτελέσματα —{" "}
            {activeTool === "dup"
              ? "Διπλότυπα"
              : activeTool === "phone"
                ? "Τηλέφωνα"
                : activeTool === "predict"
                  ? "Προβλεπτική λίστα"
                  : "Εξαγωγή"}
          </span>
          <span className="text-xs font-semibold text-[#C9A84C]">{resultsOpen ? "Σύμπτυξη" : "Ανάπτυξη"}</span>
        </button>

        {resultsOpen && (
          <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-6">
            {activeTool === "dup" && (
              <div className="space-y-4">
                {dups === null && (
                  <p className="text-sm text-[var(--text-secondary)]">Πατήστε «Έλεγχος διπλοτύπων» στο παραπάνω κουτί.</p>
                )}
                {dups && dups.length === 0 && <p className="text-sm text-[#16A34A]">Δεν βρέθηκαν ύποπτα ζεύγη.</p>}
                {dups &&
                  dups.length > 0 &&
                  dups.map((p) => (
                    <div
                      key={`${p.contactA.id}-${p.contactB.id}`}
                      className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4 md:grid-cols-2"
                    >
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-secondary)]">Επαφή Α</p>
                        <CardSide c={p.contactA} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-secondary)]">Επαφή Β</p>
                        <CardSide c={p.contactB} />
                      </div>
                      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#C9A84C]/50 bg-[#C9A84C]/10 px-2.5 py-0.5 text-xs font-bold text-[#0A1628] dark:text-[#E8C96B]">
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
                          <button type="button" className={lux.btnGold + " !py-2 text-xs"} onClick={() => void familyPair(p.contactA, p.contactB)}>
                            Οικογένεια
                          </button>
                          <button type="button" className={lux.btnSecondary + " !py-2 text-xs"} onClick={() => void dismissPair(p.contactA, p.contactB)}>
                            Αγνόησε
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {activeTool === "phone" && (
              <div className="space-y-4">
                {!phoneAudit && !phoneLoading && (
                  <p className="text-sm text-[var(--text-secondary)]">Πατήστε «Έλεγχος τηλεφώνων» στο παραπάνω κουτί.</p>
                )}
                {phoneAudit && (
                  <div className="space-y-6">
                    {phoneAudit.empty.length > 0 && (
                      <div className={lux.card + " !shadow-sm"}>
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
                      </div>
                    )}
                    {phoneAudit.invalid.length > 0 && (
                      <div className={lux.card + " !shadow-sm"}>
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
                      </div>
                    )}
                    {phoneAudit.phoneDuplicates.length > 0 && (
                      <div className={lux.card + " !shadow-sm"}>
                        <h2 className={lux.sectionTitle + " mb-3"}>Ίδιος αριθμός (2+ επαφές)</h2>
                        {phoneAudit.phoneDuplicates.map((g) => (
                          <div key={g.normalized} className="mb-4 last:mb-0">
                            <p className="mb-2 text-xs text-[var(--text-secondary)]">Νούμερο: {g.normalized}</p>
                            <ul className="space-y-1">
                              {g.contacts.map((c) => (
                                <li key={c.id} className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-2 py-1.5">
                                  {c.first_name} {c.last_name}
                                  <Link href={`/contacts/${c.id}`} className="text-xs font-medium text-[#003476] hover:underline dark:text-[#93C5FD]">
                                    Άνοιγμα
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                    {phoneAudit.empty.length === 0 && phoneAudit.invalid.length === 0 && phoneAudit.phoneDuplicates.length === 0 && (
                      <p className="text-sm text-[#16A34A]">Δεν βρέθηκαν προβλήματα τηλεφώνου.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTool === "predict" && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">Υπολογισμός σκορ πειθούς (0–100)</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Κατάσταση κλήσης, στάση, τηλέφωνο, επιρροή, ηλικία και εκλογικά ΝΔ ανά δήμο.
                    </p>
                    {scoreMsg && <p className="mt-2 text-xs text-[var(--accent-gold)]">{scoreMsg}</p>}
                  </div>
                  <button type="button" className={lux.btnPrimary + " shrink-0"} disabled={scoring} onClick={() => void runPredictedScores()}>
                    {scoring ? "Υπολογισμός…" : "Υπολογισμός σκορ"}
                  </button>
                </div>
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
                      <li key={row.contact_id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/20 p-3 text-sm">
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
                  <p className="text-sm text-[var(--text-muted)]">Καμία λίστα — πατήστε δημιουργία ή φόρτωση.</p>
                )}
              </div>
            )}

            {activeTool === "export" && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Κατέβασμα XLSX / ZIP. Το εβδομαδιαίο αυτόματο αποστέλλεται από το cron στο ADMIN_EMAIL.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
          </div>
        )}
      </section>

      <CenteredModal
        open={!!mergeTarget}
        onClose={() => setMergeTarget(null)}
        title="Συγχώνευση"
        className="max-w-md"
        ariaLabel="Συγχώνευση επαφών"
        footer={
          <>
            <button type="button" className={lux.btnSecondary} onClick={() => setMergeTarget(null)} disabled={mergeBusy}>
              Άκυρο
            </button>
            <FormSubmitButton type="button" variant="gold" loading={mergeBusy} onClick={() => void doMerge()}>
              Συγχώνευση
            </FormSubmitButton>
          </>
        }
      >
        {mergeTarget ? (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Ποια εγγραφή να κρατήσουμε; (οι κλήσεις, tasks και αιτήματα μεταφέρονται)
            </p>
            <div className="mt-4 grid gap-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] p-3">
                <input type="radio" name="k" checked={keepSide === "a"} onChange={() => setKeepSide("a")} />
                <span>
                  {mergeTarget.contactA.first_name} {mergeTarget.contactA.last_name}
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] p-3">
                <input type="radio" name="k" checked={keepSide === "b"} onChange={() => setKeepSide("b")} />
                <span>
                  {mergeTarget.contactB.first_name} {mergeTarget.contactB.last_name}
                </span>
              </label>
            </div>
          </>
        ) : null}
      </CenteredModal>
    </div>
  );
}

function ToolCard({
  title,
  description,
  icon,
  active,
  onOpen,
  actionLabel,
  onAction,
  busy,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  onOpen: () => void;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-4 rounded-2xl border p-5 transition",
        active
          ? "border-[#C9A84C]/50 bg-[var(--bg-card)] shadow-[0_0_0_1px_rgba(201,168,76,0.2),0_16px_48px_rgba(0,0,0,0.35)]"
          : "border-[var(--border)] bg-[var(--bg-card)]/80 hover:border-[var(--border)] hover:bg-[var(--bg-card)]",
      ].join(" ")}
    >
      <div className="flex gap-4">
        <div className={GOLD_ICON}>{icon}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" className={lux.btnSecondary + " !text-sm"} onClick={onOpen}>
          Προβολή αποτελεσμάτων
        </button>
        <button type="button" className={lux.btnPrimary + " !text-sm"} onClick={onAction} disabled={busy}>
          {actionLabel}
        </button>
      </div>
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
