"use client";

import { X } from "lucide-react";
import { useCallback, useMemo, useState, type ChangeEventHandler } from "react";
import {
  CRM_FIELD_IDS,
  type CrmFieldId,
  crmFieldLabel,
  mapRowsToContacts,
  type MappedRowForInsert,
  suggestCrmField,
  tryParseDelimited,
} from "@/lib/csv-import-mapping";
import { clientChunkedImportMapped, IMPORT_FETCH_TIMEOUT_MS } from "@/lib/chunked-contact-import";
import { DUPLICATE_FIELD_LABELS, type DuplicateMatch } from "@/lib/import-dedup";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { HqSelect } from "@/components/ui/hq-select";
import { ModalShell } from "@/components/ui/centered-modal";
import { useFormToast } from "@/contexts/form-toast-context";

const STEPS = [
  { id: 1, title: "Ανέβασμα & αντιστοίχιση" },
  { id: 2, title: "Προεπισκόπηση" },
  { id: 3, title: "Διπλότυπα" },
  { id: 4, title: "Εισαγωγή" },
  { id: 5, title: "Αποτελέσματα" },
] as const;

type Props = {
  onImported: () => void;
  /** When true, opens the modal immediately (for dedicated /contacts/import page). */
  defaultOpen?: boolean;
};

type DuplicateMode = "skip" | "update";

function StepDots({ current }: { current: number }) {
  return (
    <div className="mb-4 flex flex-wrap justify-center gap-2">
      {STEPS.map((s) => (
        <span
          key={s.id}
          className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
            s.id === current
              ? "bg-[#C9A84C]/25 text-[#C9A84C] ring-1 ring-[#C9A84C]/50"
              : s.id < current
                ? "text-[#94A3B8] line-through opacity-60"
                : "text-[#6B7F96]"
          }`}
        >
          {s.id}. {s.title}
        </span>
      ))}
    </div>
  );
}

export function ContactsImportWizard({ onImported, defaultOpen = false }: Props) {
  const { showToast } = useFormToast();
  const [fileInputKey, setFileInputKey] = useState(0);
  const [open, setOpen] = useState(defaultOpen);
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pdfMode, setPdfMode] = useState<"table" | "textOnly" | null>(null);
  const [pdfText, setPdfText] = useState("");

  const [fields, setFields] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CrmFieldId>>({});

  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);

  const [importing, setImporting] = useState(false);
  const [chunkProgress, setChunkProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    skipped_duplicates: number;
    errors: number;
    errorDetails: { phone: string; message: string }[];
  } | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [parseNote, setParseNote] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFileName(null);
    setPdfMode(null);
    setPdfText("");
    setFields([]);
    setRawRows([]);
    setMapping({});
    setDuplicateMode("skip");
    setDuplicates([]);
    setCheckingDupes(false);
    setImporting(false);
    setChunkProgress({ done: 0, total: 0 });
    setResult(null);
    setErrMsg(null);
    setParseNote(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setFileInputKey((k) => k + 1);
    setTimeout(() => {
      reset();
    }, 300);
  }, [reset]);

  const applyParsed = useCallback((parsed: { data: Record<string, string>[]; fields: string[] }, name: string) => {
    setFields(parsed.fields);
    setRawRows(parsed.data);
    const m: Record<string, CrmFieldId> = {};
    for (const f of parsed.fields) {
      m[f] = suggestCrmField(f);
    }
    setMapping(m);
    setPdfMode("table");
    setFileName(name);
    setStep(1);
    setOpen(true);
    if (parsed.fields.length === 1) {
      setParseNote("Βρέθηκε μία μόνο στήλη. Αντιστοιχίστε χειροκίνητα σε πολλαπλά πεδία.");
    } else {
      setParseNote(null);
    }
  }, []);

  const onPickFile: ChangeEventHandler<HTMLInputElement> = async (e) => {
    setErrMsg(null);
    setResult(null);
    setParseNote(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    try {
      if (isPdf) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetchWithTimeout("/api/contacts/extract-pdf", { method: "POST", body: formData });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          const msg = j.error ?? "Αποτυχία εξαγωγής PDF";
          setErrMsg(msg);
          showToast(msg, "error");
          return;
        }
        const { text = "" } = (await res.json()) as { text: string };
        setPdfText(text);
        const parsed = tryParseDelimited(text);
        if (parsed && parsed.data.length > 0 && parsed.fields.length >= 1) {
          applyParsed(parsed, file.name);
        } else {
          setFileName(file.name);
          setPdfMode("textOnly");
          setOpen(true);
        }
        return;
      }

      const text = await file.text();
      const parsed = tryParseDelimited(text);
      if (!parsed || parsed.data.length === 0) {
        const msg = "Δεν αναλύθηκε αρχείο. Δοκιμάστε CSV (διαχωριστή , ; ή tab).";
        setErrMsg(msg);
        showToast(msg, "error");
        return;
      }
      applyParsed(parsed, file.name);
    } catch {
      const msg = "Σφάλμα ανάγνωσης αρχείου.";
      setErrMsg(msg);
      showToast(msg, "error");
    }
  };

  const setMap = useCallback((h: string, v: CrmFieldId) => {
    setMapping((prev) => ({ ...prev, [h]: v }));
  }, []);

  const { summaryToImport, summarySkipped, mappedRows } = useMemo(() => {
    if (!rawRows.length) {
      return { summaryToImport: 0, summarySkipped: 0, mappedRows: [] as MappedRowForInsert[] };
    }
    const m = mapRowsToContacts(rawRows, mapping);
    return {
      summaryToImport: m.rows.length,
      summarySkipped: m.skippedNoPhone + m.skippedEmpty,
      mappedRows: m.rows,
    };
  }, [rawRows, mapping]);

  const previewRows = useMemo(() => rawRows.slice(0, 20), [rawRows]);

  const checkDuplicates = useCallback(async () => {
    if (mappedRows.length === 0) return;
    setCheckingDupes(true);
    setErrMsg(null);
    try {
      const res = await fetchWithTimeout("/api/contacts/import-mapped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: mappedRows, dry_run: true }),
        timeoutMs: IMPORT_FETCH_TIMEOUT_MS,
      });
      const j = (await res.json().catch(() => ({}))) as { duplicates?: DuplicateMatch[]; error?: string };
      if (!res.ok) {
        setErrMsg(j.error ?? "Σφάλμα ελέγχου διπλοτύπων");
        return;
      }
      setDuplicates(j.duplicates ?? []);
      setStep(3);
    } catch {
      setErrMsg("Αποτυχία ελέγχου διπλοτύπων.");
    } finally {
      setCheckingDupes(false);
    }
  }, [mappedRows]);

  const runImport = useCallback(async () => {
    if (mappedRows.length === 0) {
      const msg = "Καμία έγκυρη γραμμή με τηλέφωνο.";
      setErrMsg(msg);
      showToast(msg, "error");
      return;
    }
    setErrMsg(null);
    setResult(null);
    setImporting(true);
    setStep(4);
    setChunkProgress({ done: 0, total: 0 });
    try {
      const agg = await clientChunkedImportMapped(
        mappedRows as unknown as Record<string, unknown>[],
        {
          duplicate_mode: duplicateMode,
          skip_duplicates: duplicateMode === "skip",
          update_existing: duplicateMode === "update",
        },
        (done, total) => setChunkProgress({ done, total }),
      );
      setResult({
        inserted: agg.inserted,
        updated: agg.updated,
        skipped_duplicates: agg.skipped_duplicates,
        errors: agg.errors,
        errorDetails: agg.errorDetails,
      });
      setStep(5);
      onImported();
      const msg = `Ολοκληρώθηκε: ${agg.inserted} νέες, ${agg.updated} ενημερώσεις.`;
      showToast(msg, agg.inserted + agg.updated > 0 ? "success" : "error");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Σφάλμα εισαγωγής";
      setErrMsg(msg);
      showToast(msg, "error");
      setStep(3);
    } finally {
      setImporting(false);
    }
  }, [mappedRows, duplicateMode, onImported, showToast]);

  const progressPct =
    chunkProgress.total > 0 ? Math.round((chunkProgress.done / chunkProgress.total) * 100) : 0;

  return (
    <>
      {!defaultOpen && (
        <div className={lux.card + " !py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"}>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Μαζική εισαγωγή (CSV / PDF)</p>
            <p className="mt-0.5 text-xs text-[var(--text-subtitle)]">
              Οδηγός: αντιστοίχιση, προεπισκόπηση, διπλότυπα, εισαγωγή
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              key={fileInputKey}
              type="file"
              accept=".csv,.txt,application/pdf,text/csv"
              onChange={onPickFile}
              className="text-sm text-[var(--text-subtitle)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--bg-elevated)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--text-primary)]"
            />
          </div>
          {errMsg && !open && <p className="w-full text-sm text-amber-200/95">{errMsg}</p>}
        </div>
      )}

      {defaultOpen && !open && rawRows.length === 0 && (
        <div className={lux.card + " flex flex-col items-center gap-4 py-10"}>
          <p className="text-sm text-[var(--text-subtitle)]">Ανεβάστε CSV ή PDF για να ξεκινήσετε την εισαγωγή.</p>
          <input
            key={fileInputKey}
            type="file"
            accept=".csv,.txt,application/pdf,text/csv"
            onChange={onPickFile}
            className="text-sm text-[var(--text-subtitle)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--bg-elevated)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--text-primary)]"
          />
          {errMsg && <p className="text-sm text-amber-200/95">{errMsg}</p>}
        </div>
      )}

      {open && (
        <ModalShell open={open} onClose={close}>
          <div
            className="flex max-h-[100dvh] w-[min(720px,calc(100vw-2rem))] max-w-full flex-col border border-[var(--border)] bg-[#0A1628] shadow-2xl sm:max-h-[min(90dvh,880px)] sm:rounded-2xl sm:border"
            role="dialog"
            aria-modal
            aria-labelledby="import-wizard-title"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 pr-2">
              <h2 id="import-wizard-title" className="text-base font-semibold text-[#F0F4FF]">
                {pdfMode === "textOnly" ? "PDF — Προεπισκόπηση" : "Μαζική εισαγωγή επαφών"}
              </h2>
              <button
                type="button"
                onClick={close}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#94A3B8] transition hover:bg-[var(--bg-elevated)] hover:text-white"
                aria-label="Κλείσιμο"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {fileName && <p className="border-b border-[var(--border)] px-4 py-1.5 text-xs text-[#94A3B8]">{fileName}</p>}

            {pdfMode === "textOnly" && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="mb-2 text-sm text-[#94A3B8]">
                  Αναλήφθηκε κείμενο από PDF χωρίς αναγνωρίσιμο πίνακα. Μετατρέψτε σε CSV ή Excel.
                </p>
                <pre className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--border)] bg-[#050D1A] p-3 text-left text-xs text-[#CBD5E1]">
                  {pdfText.slice(0, 12_000)}
                </pre>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={close} className={lux.btnBlue + " !py-2"}>
                    Κλείσιμο
                  </button>
                </div>
              </div>
            )}

            {pdfMode === "table" && step >= 1 && step <= 4 && (
              <>
                <div className="shrink-0 p-3 pb-0">
                  <StepDots current={step} />
                </div>
                {parseNote && step === 1 && <p className="px-4 pb-2 text-xs text-amber-200/90">{parseNote}</p>}

                {step === 1 && (
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
                    <p className="mb-3 text-sm text-[#94A3B8]">
                      Σύνολο γραμμών: {rawRows.length}. Αντιστοιχίστε κάθε στήλη σε πεδίο CRM.
                    </p>
                    <div className="space-y-3">
                      {fields.map((f) => (
                        <div key={f} className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-center">
                          <p className="min-w-0 break-words text-sm font-medium text-[#F0F4FF]">«{f}»</p>
                          <HqSelect
                            className={lux.select + " w-full !text-sm sm:max-w-[320px]"}
                            wrapperClassName="w-full min-w-0 sm:max-w-[320px]"
                            value={mapping[f] ?? "ignore"}
                            onChange={(e) => setMap(f, e.target.value as CrmFieldId)}
                          >
                            {CRM_FIELD_IDS.map((id) => (
                              <option key={id} value={id}>
                                {crmFieldLabel(id)}
                              </option>
                            ))}
                          </HqSelect>
                        </div>
                      ))}
                    </div>
                    {errMsg && <p className="mt-2 text-sm text-red-300/95">{errMsg}</p>}
                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" onClick={close} className={lux.btnSecondary + " !py-2 text-sm"}>
                        Άκυρο
                      </button>
                      <button
                        type="button"
                        disabled={summaryToImport === 0}
                        onClick={() => {
                          setStep(2);
                          setErrMsg(null);
                        }}
                        className={lux.btnBlue + " !py-2 text-sm disabled:opacity-40"}
                      >
                        Συνέχεια
                      </button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
                    <p className="mb-3 text-sm text-[#94A3B8]">
                      Προεπισκόπηση {previewRows.length} από {rawRows.length} γραμμές ·{" "}
                      <strong className="text-white">{summaryToImport}</strong> έγκυρες,{" "}
                      <strong className="text-amber-200/95">{summarySkipped}</strong> παραλείπονται.
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                        <thead>
                          <tr className={lux.tableHead}>
                            {fields.map((f) => (
                              <th key={f} className="p-2 pl-3">
                                {f}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, i) => (
                            <tr key={i} className={lux.tableRow}>
                              {fields.map((f) => (
                                <td key={f} className="max-w-[180px] truncate p-2 pl-3 text-xs text-[#E2E8F0]">
                                  {row[f] ?? "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-between gap-2">
                      <button type="button" onClick={() => setStep(1)} className={lux.btnSecondary + " !py-2 text-sm"}>
                        Πίσω
                      </button>
                      <button
                        type="button"
                        disabled={checkingDupes || summaryToImport === 0}
                        onClick={checkDuplicates}
                        className={lux.btnBlue + " !py-2 text-sm disabled:opacity-40"}
                      >
                        {checkingDupes ? "Έλεγχος…" : "Έλεγχος διπλοτύπων"}
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && !importing && (
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
                    <p className="text-sm text-[#CBD5E1]">
                      Βρέθηκαν <strong className="text-amber-200">{duplicates.length}</strong> διπλότυπα από{" "}
                      {summaryToImport} γραμμές.
                    </p>
                    {duplicates.length > 0 && (
                      <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] p-3 text-xs text-[#94A3B8]">
                        {duplicates.slice(0, 15).map((d, i) => (
                          <li key={i} className="mb-1">
                            Γραμμή {d.row_index}: {d.name_hint} — {DUPLICATE_FIELD_LABELS[d.matched_field]} (
                            {d.matched_value})
                          </li>
                        ))}
                        {duplicates.length > 15 && <li>…και {duplicates.length - 15} ακόμα</li>}
                      </ul>
                    )}
                    <div className="mt-4 space-y-2">
                      <p className="text-sm text-[#94A3B8]">Για όλα τα διπλότυπα:</p>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#E2E8F0]">
                        <input
                          type="radio"
                          name="dupMode"
                          checked={duplicateMode === "skip"}
                          onChange={() => setDuplicateMode("skip")}
                        />
                        Παράλειψη διπλοτύπων
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#E2E8F0]">
                        <input
                          type="radio"
                          name="dupMode"
                          checked={duplicateMode === "update"}
                          onChange={() => setDuplicateMode("update")}
                        />
                        Ενημέρωση υπαρχουσών επαφών
                      </label>
                    </div>
                    {errMsg && <p className="mt-2 text-sm text-red-300/90">{errMsg}</p>}
                    <div className="mt-4 flex flex-wrap justify-between gap-2">
                      <button type="button" onClick={() => setStep(2)} className={lux.btnSecondary + " !py-2 text-sm"}>
                        Πίσω
                      </button>
                      <button type="button" onClick={runImport} className={lux.btnBlue + " !py-2 text-sm"}>
                        Έναρξη εισαγωγής
                      </button>
                    </div>
                  </div>
                )}

                {step === 4 && importing && (
                  <div className="p-6 text-center">
                    <p className="text-sm text-[#94A3B8]">
                      Εισαγωγή τμήματος {chunkProgress.done} από {chunkProgress.total || "…"}
                    </p>
                    <div className="mx-auto mt-3 h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-[#162540]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#003476] to-[#C9A84C] transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[#94A3B8]">{progressPct}%</p>
                  </div>
                )}
              </>
            )}

            {step === 5 && result && (
              <div className="p-4">
                <p className="text-center text-lg font-bold text-white">
                  <span className="text-emerald-300">{result.inserted}</span> νέες,{" "}
                  <span className="text-sky-300">{result.updated}</span> ενημερώσεις,{" "}
                  <span className="text-amber-200/95">{result.skipped_duplicates}</span> παραλείφθηκαν,{" "}
                  <span className="text-red-300">{result.errors}</span> σφάλματα
                </p>
                {result.errorDetails.length > 0 && (
                  <ul className="mt-3 max-h-32 overflow-y-auto text-left text-xs text-[#94A3B8]">
                    {result.errorDetails.map((d, i) => (
                      <li key={i} className="mb-1">
                        {d.phone}: {d.message}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex justify-center">
                  <button type="button" onClick={close} className={lux.btnBlue + " !py-2"}>
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}
