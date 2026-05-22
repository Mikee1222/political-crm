"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Download, ExternalLink, Pencil, Phone, Sparkles, Trash2, X } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { cn } from "@/lib/utils";
import type { ContactGroupRow } from "@/lib/contact-groups";
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

type PhoneIssue = "missing" | "invalid" | "duplicate";

type SelectableRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  municipality: string | null;
  contact_code?: string | null;
  issue?: PhoneIssue;
};

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
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEditField, setBulkEditField] = useState("call_status");
  const [bulkEditValue, setBulkEditValue] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkEditBusy, setBulkEditBusy] = useState(false);
  const [groups, setGroups] = useState<ContactGroupRow[]>([]);

  useEffect(() => {
    setSelectedContacts(new Set());
  }, [activeTool]);

  useEffect(() => {
    void fetchWithTimeout("/api/groups")
      .then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as { groups?: ContactGroupRow[] };
        setGroups(d.groups ?? []);
      })
      .catch(() => setGroups([]));
  }, []);

  const phoneResults = useMemo((): SelectableRow[] => {
    if (!phoneAudit) return [];
    const rows: SelectableRow[] = [];
    for (const c of phoneAudit.empty) {
      rows.push({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        municipality: c.municipality,
        issue: "missing",
      });
    }
    for (const c of phoneAudit.invalid) {
      rows.push({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        municipality: c.municipality,
        issue: "invalid",
      });
    }
    for (const g of phoneAudit.phoneDuplicates) {
      for (const c of g.contacts) {
        rows.push({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          municipality: c.municipality,
          issue: "duplicate",
        });
      }
    }
    return rows;
  }, [phoneAudit]);

  const dupContactIds = useMemo(() => {
    if (!dups?.length) return [];
    return [...new Set(dups.flatMap((p) => [p.contactA.id, p.contactB.id]))];
  }, [dups]);

  const predictIds = useMemo(() => (predList ?? []).map((r) => r.contact_id), [predList]);

  const toggleSelect = (id: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    if (ids.length > 0 && ids.every((id) => selectedContacts.has(id))) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(ids));
    }
  };

  const pruneSelectionFromResults = () => {
    const sel = selectedContacts;
    setPhoneAudit((prev) => {
      if (!prev) return prev;
      return {
        empty: prev.empty.filter((c) => !sel.has(c.id)),
        invalid: prev.invalid.filter((c) => !sel.has(c.id)),
        phoneDuplicates: prev.phoneDuplicates
          .map((g) => ({ ...g, contacts: g.contacts.filter((c) => !sel.has(c.id)) }))
          .filter((g) => g.contacts.length > 0),
      };
    });
    setDups((prev) =>
      (prev ?? []).filter((p) => !sel.has(p.contactA.id) && !sel.has(p.contactB.id)),
    );
    setPredList((prev) => (prev ?? []).filter((r) => !sel.has(r.contact_id)));
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.size === 0) return;
    if (!confirm(`Να διαγραφούν ${selectedContacts.size} επαφές; Η ενέργεια δεν αναιρείται.`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedContacts);
      const res = await fetchWithTimeout("/api/contacts/manager-bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_confirmed: true, contact_ids: ids }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; deleted?: number };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα διαγραφής", "error");
        return;
      }
      pruneSelectionFromResults();
      setSelectedContacts(new Set());
      showToast(`Διαγράφηκαν ${j.deleted ?? ids.length} επαφές.`, "success");
    } catch {
      showToast("Σφάλμα δικτύου", "error");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkEdit = async () => {
    if (!bulkEditValue || selectedContacts.size === 0) return;
    setBulkEditBusy(true);
    try {
      const res = await fetchWithTimeout("/api/contacts/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_field",
          contact_ids: Array.from(selectedContacts),
          field: bulkEditField,
          value: bulkEditValue,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(j.error ?? "Σφάλμα ενημέρωσης", "error");
        return;
      }
      setShowBulkEdit(false);
      setBulkEditValue("");
      setSelectedContacts(new Set());
      showToast("Οι επαφές ενημερώθηκαν.", "success");
    } catch {
      showToast("Σφάλμα δικτύου", "error");
    } finally {
      setBulkEditBusy(false);
    }
  };

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
            {(activeTool === "dup" || activeTool === "phone" || activeTool === "predict") && (
              <BulkActionBar
                count={selectedContacts.size}
                onEdit={() => {
                  setBulkEditField("call_status");
                  setBulkEditValue("");
                  setShowBulkEdit(true);
                }}
                onDelete={() => void handleBulkDelete()}
                onClear={() => setSelectedContacts(new Set())}
                deleting={bulkDeleting}
              />
            )}

            {activeTool === "dup" && (
              <div className="space-y-4">
                {dups === null && (
                  <p className="text-sm text-[var(--text-secondary)]">Πατήστε «Έλεγχος διπλοτύπων» στο παραπάνω κουτί.</p>
                )}
                {dups && dups.length === 0 && <p className="text-sm text-[#16A34A]">Δεν βρέθηκαν ύποπτα ζεύγη.</p>}
                {dups && dups.length > 0 && (
                  <SelectAllHeader
                    ids={dupContactIds}
                    count={dupContactIds.length}
                    selected={selectedContacts}
                    onToggleAll={toggleSelectAll}
                  />
                )}
                {dups &&
                  dups.length > 0 &&
                  dups.map((p) => (
                    <div
                      key={`${p.contactA.id}-${p.contactB.id}`}
                      className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4 md:grid-cols-2"
                    >
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-secondary)]">Επαφή Α</p>
                        <DupContactPick
                          c={p.contactA}
                          selected={selectedContacts.has(p.contactA.id)}
                          onToggle={() => toggleSelect(p.contactA.id)}
                        />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-secondary)]">Επαφή Β</p>
                        <DupContactPick
                          c={p.contactB}
                          selected={selectedContacts.has(p.contactB.id)}
                          onToggle={() => toggleSelect(p.contactB.id)}
                        />
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
                  <div className="space-y-4">
                    {phoneResults.length > 0 ? (
                      <>
                        <SelectAllHeader
                          ids={phoneResults.map((c) => c.id)}
                          count={phoneResults.length}
                          selected={selectedContacts}
                          onToggleAll={toggleSelectAll}
                        />
                        <div className="space-y-2">
                          {phoneResults.map((c) => (
                            <SelectableContactRow
                              key={`${c.id}-${c.issue}`}
                              contact={c}
                              selected={selectedContacts.has(c.id)}
                              onToggle={() => toggleSelect(c.id)}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
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
                  <>
                    <SelectAllHeader
                      ids={predictIds}
                      count={predList.length}
                      selected={selectedContacts}
                      onToggleAll={toggleSelectAll}
                    />
                    <ul className="space-y-2">
                      {predList.map((row) => (
                        <li key={row.contact_id}>
                          <div
                            className={cn(
                              "rounded-xl border p-3 text-sm transition-colors",
                              selectedContacts.has(row.contact_id)
                                ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_8%,var(--bg-card))]"
                                : "border-border bg-card hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,var(--bg-card))]",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <CheckboxMark
                                checked={selectedContacts.has(row.contact_id)}
                                onToggle={() => toggleSelect(row.contact_id)}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium text-foreground">
                                    #{row.rank} {row.first_name} {row.last_name} · {row.phone ?? "—"} ·{" "}
                                    {row.municipality ?? "—"}
                                  </span>
                                  <span className="text-[var(--accent-gold)]">Σκορ: {row.score}</span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {row.breakdown
                                    .map((b) => `${b.reason} (${b.points > 0 ? "+" : ""}${b.points})`)
                                    .join(" · ")}
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
                                      setSelectedContacts((prev) => {
                                        const next = new Set(prev);
                                        next.delete(row.contact_id);
                                        return next;
                                      });
                                    }}
                                  >
                                    Παράλειψη
                                  </button>
                                </div>
                              </div>
                              <Link
                                href={`/contacts/${row.contact_id}`}
                                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-card))]"
                                aria-label="Άνοιγμα επαφής"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
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

      {showBulkEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="mb-4 font-semibold text-foreground">
              Μαζική Επεξεργασία ({selectedContacts.size} επαφές)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Πεδίο
                </label>
                <select
                  value={bulkEditField}
                  onChange={(e) => {
                    setBulkEditField(e.target.value);
                    setBulkEditValue("");
                  }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
                >
                  <option value="call_status">Κατάσταση Κλήσης</option>
                  <option value="group_id">Ομάδα</option>
                  <option value="priority">Προτεραιότητα</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Τιμή
                </label>
                {bulkEditField === "call_status" && (
                  <select
                    value={bulkEditValue}
                    onChange={(e) => setBulkEditValue(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
                  >
                    <option value="">Επιλέξτε...</option>
                    <option value="Positive">Θετική</option>
                    <option value="Negative">Αρνητική</option>
                    <option value="No Answer">Δεν απαντά</option>
                    <option value="Pending">Σε αναμονή</option>
                  </select>
                )}
                {bulkEditField === "group_id" && (
                  <select
                    value={bulkEditValue}
                    onChange={(e) => setBulkEditValue(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
                  >
                    <option value="">Επιλέξτε...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
                {bulkEditField === "priority" && (
                  <select
                    value={bulkEditValue}
                    onChange={(e) => setBulkEditValue(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
                  >
                    <option value="">Επιλέξτε...</option>
                    <option value="Low">Χαμηλή</option>
                    <option value="Medium">Μεσαία</option>
                    <option value="High">Υψηλή</option>
                    <option value="Urgent">Επείγον</option>
                  </select>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowBulkEdit(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground"
                disabled={bulkEditBusy}
              >
                Άκυρο
              </button>
              <button
                type="button"
                onClick={() => void handleBulkEdit()}
                disabled={!bulkEditValue || bulkEditBusy}
                className="flex-1 rounded-xl bg-[var(--accent-gold)] py-2.5 text-sm font-semibold text-[var(--text-badge-on-gold)] disabled:opacity-50"
              >
                {bulkEditBusy ? "…" : "Εφαρμογή"}
              </button>
            </div>
          </div>
        </div>
      )}

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

function CheckboxMark({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
        checked ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]" : "border-border hover:border-[var(--accent-gold)]/60",
      )}
      aria-pressed={checked}
    >
      {checked ? <Check className="h-3 w-3 text-[var(--text-badge-on-gold)]" aria-hidden /> : null}
    </button>
  );
}

function SelectAllHeader({
  ids,
  count,
  selected,
  onToggleAll,
}: {
  ids: string[];
  count: number;
  selected: Set<string>;
  onToggleAll: (ids: string[]) => void;
}) {
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <button
        type="button"
        onClick={() => onToggleAll(ids)}
        className={cn(
          "flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border-2 transition-colors",
          allSelected ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]" : "border-border hover:border-[var(--accent-gold)]/60",
        )}
        aria-label={allSelected ? "Αποεπιλογή όλων" : "Επιλογή όλων"}
      >
        {allSelected ? <Check className="h-3 w-3 text-[var(--text-badge-on-gold)]" aria-hidden /> : null}
      </button>
      <span className="text-xs text-muted-foreground">Επιλογή όλων ({count})</span>
    </div>
  );
}

function BulkActionBar({
  count,
  onEdit,
  onDelete,
  onClear,
  deleting,
}: {
  count: number;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  deleting: boolean;
}) {
  if (count <= 0) return null;
  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent-gold)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent-gold)_10%,var(--bg-card))] px-4 py-3">
      <div className="flex flex-1 items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-gold)]">
          <span className="text-[10px] font-bold text-[var(--text-badge-on-gold)]">{count}</span>
        </div>
        <span className="text-sm font-medium text-foreground">{count} επαφές επιλεγμένες</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-card))]"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Επεξεργασία
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {deleting ? "…" : "Διαγραφή"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-card))]"
          aria-label="Καθαρισμός επιλογής"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function SelectableContactRow({
  contact,
  selected,
  onToggle,
}: {
  contact: SelectableRow;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
        selected
          ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_8%,var(--bg-card))]"
          : "border-border bg-card hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,var(--bg-card))]",
      )}
    >
      <CheckboxMark checked={selected} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {contact.first_name} {contact.last_name}
          </span>
          {contact.contact_code ? (
            <span className="font-mono text-[10px] text-muted-foreground">{contact.contact_code}</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {contact.phone || "Χωρίς τηλέφωνο"} · {contact.municipality ?? "—"}
        </div>
        {contact.issue ? (
          <div className="mt-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                contact.issue === "missing" && "bg-red-500/10 text-red-600 dark:text-red-400",
                contact.issue === "invalid" && "bg-orange-500/10 text-orange-700 dark:text-orange-300",
                contact.issue === "duplicate" && "bg-yellow-500/10 text-yellow-800 dark:text-yellow-300",
              )}
            >
              {contact.issue === "missing" && "Χωρίς τηλέφωνο"}
              {contact.issue === "invalid" && "Μη έγκυρο"}
              {contact.issue === "duplicate" && "Διπλό νούμερο"}
            </span>
          </div>
        ) : null}
      </div>
      <Link
        href={`/contacts/${contact.id}`}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--bg-card))]"
        aria-label="Άνοιγμα επαφής"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function DupContactPick({
  c,
  selected,
  onToggle,
}: {
  c: C;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
        selected
          ? "border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_8%,transparent)]"
          : "border-[var(--border)] bg-[var(--bg-card)]/50",
      )}
    >
      <CheckboxMark checked={selected} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--text-primary)]">
          {c.first_name} {c.last_name}
        </p>
        <p className="mt-1 font-mono text-[var(--text-secondary)]">{c.phone ?? "—"}</p>
        <p className="text-[var(--text-secondary)]">Περιοχή: {c.area ?? "—"}</p>
        <p className="text-[var(--text-secondary)]">Δήμος: {c.municipality ?? "—"}</p>
      </div>
      <Link
        href={`/contacts/${c.id}`}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-[var(--accent-gold)]"
        aria-label="Άνοιγμα επαφής"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
