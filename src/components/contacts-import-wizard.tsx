"use client";

import { X } from "lucide-react";
import { useCallback, useMemo, useState, type ChangeEventHandler } from "react";
import { createPortal } from "react-dom";
import {
  CRM_FIELD_IDS,
  type CrmFieldId,
  crmFieldLabel,
  mapRowsToContacts,
  type MappedRowForInsert,
  suggestCrmField,
  tryParseDelimited,
} from "@/lib/csv-import-mapping";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";

const BATCH = 30;

const STEPS = [
  { id: 1, title: "Προεπισκόπηση" },
  { id: 2, title: "Αντιστοίχιση στηλών" },
  { id: 3, title: "Εισαγωγή" },
] as const;

type Props = {
  onImported: () => void;
};

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

export function ContactsImportWizard({ onImported }: Props) {
  const { showToast } = useFormToast();
  const [fileInputKey, setFileInputKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pdfMode, setPdfMode] = useState<"table" | "textOnly" | null>(null);
  const [pdfText, setPdfText] = useState("");

  const [fields, setFields] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CrmFieldId>>({});

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ inserted: number; errors: number; errorDetails: { phone: string; message: string }[] } | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [parseNote, setParseNote] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFileName(null);
    setPdfMode(null);
    setPdfText("");
    setFields([]);
    setRawRows([]);
    setPreviewRows([]);
    setMapping({});
    setImporting(false);
    setProgress(0);
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

  const onPickFile: ChangeEventHandler<HTMLInputElement> = async (e) => {
    setErrMsg(null);
    setResult(null);
    setParseNote(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
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
        const { text = "" } = (await res.json()) as { text: string; pages?: number };
        setPdfText(text);
        const parsed = tryParseDelimited(text);
        if (parsed && parsed.data.length > 0 && parsed.fields.length >= 1) {
          setFields(parsed.fields);
          setRawRows(parsed.data);
          setPreviewRows(parsed.data.slice(0, 5));
          const m: Record<string, CrmFieldId> = {};
          for (const f of parsed.fields) {
            m[f] = suggestCrmField(f);
          }
          setMapping(m);
          setPdfMode("table");
          setStep(1);
          if (parsed.fields.length === 1) {
            setParseNote("Βρέθηκε μία μόνο στήλη. Αντιστοιχίστε χειροκίνητα σε πολλαπλά πεδία στις επόμενες βήματα, αν χρειάζεται.");
          } else {
            setParseNote(null);
          }
        } else {
          setPdfMode("textOnly");
        }
        setOpen(true);
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
      setFields(parsed.fields);
      setRawRows(parsed.data);
      setPreviewRows(parsed.data.slice(0, 5));
      const m: Record<string, CrmFieldId> = {};
      for (const f of parsed.fields) {
        m[f] = suggestCrmField(f);
      }
      setMapping(m);
      setPdfMode("table");
      setStep(1);
      setParseNote(null);
      setOpen(true);
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
    setProgress(0);
    let inserted = 0;
    let errors = 0;
    const errorDetails: { phone: string; message: string }[] = [];
    for (let i = 0; i < mappedRows.length; i += BATCH) {
      const chunk = mappedRows.slice(i, i + BATCH);
      const res = await fetchWithTimeout("/api/contacts/import-mapped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: chunk }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        inserted?: number;
        errors?: number;
        errorDetails?: { phone: string; message: string }[];
        error?: string;
      };
      if (!res.ok) {
        const msg = j.error ?? "Σφάλμα API";
        setErrMsg(msg);
        showToast(msg, "error");
        setImporting(false);
        return;
      }
      inserted += j.inserted ?? 0;
      errors += j.errors ?? 0;
      if (j.errorDetails?.length) {
        for (const d of j.errorDetails) {
          if (errorDetails.length < 15) errorDetails.push(d);
        }
      }
      setProgress(Math.min(100, Math.round(((i + chunk.length) / mappedRows.length) * 100)));
    }
    setImporting(false);
    setResult({ inserted, errors, errorDetails });
    setStep(4);
    onImported();
    if (inserted > 0) {
      showToast(`Ολοκληρώθηκε: ${inserted} επαφές${errors ? `, ${errors} σφάλματα` : ""}.`, "success");
    } else {
      showToast("Η εισαγωγή ολοκληρώθηκε χωρίς νέες εγγραφές.", "error");
    }
  }, [mappedRows, onImported, showToast]);

  if (typeof document === "undefined") {
    return null;
  }

  return (
    <>
      <div className={lux.card + " !py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"}>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Μαζική εισαγωγή (CSV / PDF)</p>
          <p className="mt-0.5 text-xs text-[var(--text-subtitle)]">Οδηγός: προεπισκόπηση, αντιστοίχιση στηλών, εισαγωγή</p>
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

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-stretch justify-end p-0 backdrop-blur-sm [background:var(--overlay-scrim)] sm:items-center sm:justify-center sm:p-4"
            role="dialog"
            aria-modal
            aria-labelledby="import-wizard-title"
          >
            <div className="flex max-h-[100dvh] w-full max-w-[720px] flex-col border border-[var(--border)] bg-[#0A1628] shadow-2xl sm:max-h-[min(90dvh,880px)] sm:rounded-2xl sm:border">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 pr-2">
                <h2 id="import-wizard-title" className="text-base font-semibold text-[#F0F4FF]">
                  {pdfMode === "textOnly" ? "PDF — Προεπισκόπηση" : "Μαζική εισαγωγή"}
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
                    Αναλήφθηκε κείμενο από PDF. Αυτόματη αναγνώριση πινάκων/στηλών <strong className="text-[#CBD5E1]">δεν ήταν
                    δυνατή</strong> τουλάχιστον με δύο στήλες. Επικολλήστε τον πίνακα σε αρχείο <strong>CSV</strong> ή
                    ανοίξτε το ίδιο αρχείο σαν CSV από Excel / Google Sheets, ή μετατρέψτε το PDF.
                  </p>
                  <pre
                    className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--border)] bg-[#050D1A] p-3 text-left text-xs leading-relaxed text-[#CBD5E1]"
                    tabIndex={0}
                  >
                    {pdfText.slice(0, 12_000)}
                    {pdfText.length > 12_000 ? "\n\n…" : ""}
                  </pre>
                  <p className="mt-3 text-sm text-amber-200/90">
                    Εισαγωγή ακυρώθηκε — απαιτείται πίνακας (πολλαπλές στήλες) για αυτόν τον οδηγό.
                  </p>
                  <div className="mt-4 flex justify-end">
                    <button type="button" onClick={close} className={lux.btnBlue + " !py-2"}>
                      Κλείσιμο
                    </button>
                  </div>
                </div>
              )}

              {pdfMode === "table" && step >= 1 && step <= 3 && (
                <>
                  <div className="shrink-0 p-3 pb-0">
                    <StepDots current={step} />
                  </div>
                  {parseNote && step === 1 && (
                    <p className="px-4 pb-2 text-xs text-amber-200/90">{parseNote}</p>
                  )}

                  {step === 1 && (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
                      <p className="mb-3 text-sm text-[#94A3B8]">Βλέπετε μέχρι 5 σειρές. Σύνολο: {rawRows.length}.</p>
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
                      {errMsg && <p className="mt-2 text-sm text-red-300/95">{errMsg}</p>}
                      <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={close} className={lux.btnSecondary + " !py-2 text-sm"}>
                          Άκυρο
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStep(2);
                            setErrMsg(null);
                          }}
                          className={lux.btnBlue + " !py-2 text-sm"}
                        >
                          Συνέχεια
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
                      <p className="mb-3 text-sm text-[#94A3B8]">
                        Επιλέξτε ποια πεδία CRM αντιστοιχούν σε κάθε στήλη. Προεπιλογή από αυτόματη παρατήρηση.
                      </p>
                      <div className="space-y-3">
                        {fields.map((f) => (
                          <div key={f} className="grid gap-2 sm:grid-cols-[1fr,auto] sm:items-center">
                            <p className="min-w-0 break-words text-sm font-medium text-[#F0F4FF]">«{f}»</p>
                            <div className="relative w-full min-w-0 sm:max-w-[320px]">
                              <HqSelect
                                className={lux.select + " w-full !text-sm"}
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
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 flex flex-wrap justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setStep(1);
                            setErrMsg(null);
                          }}
                          className={lux.btnSecondary + " !py-2 text-sm"}
                        >
                          Πίσω
                        </button>
                        <div className="flex gap-2">
                          <button type="button" onClick={close} className={lux.btnSecondary + " !py-2 text-sm"}>
                            Άκυρο
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStep(3);
                              setErrMsg(null);
                            }}
                            className={lux.btnBlue + " !py-2 text-sm"}
                          >
                            Συνέχεια
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 3 && !importing && !result && (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
                      <p className="text-sm text-[#CBD5E1]">
                        <strong className="text-white">{summaryToImport}</strong> επαφές θα εισαχθούν (έγκυρο
                        τηλέφωνο),{" "}
                        <strong className="text-amber-200/95">{summarySkipped}</strong> θα παραλειφθούν (κενά ή χωρίς
                        αναγνωρισίμο τηλέφωνο).
                      </p>
                      {errMsg && <p className="mt-2 text-sm text-red-300/90">{errMsg}</p>}
                      {summaryToImport === 0 && <p className="mt-2 text-sm text-amber-200/95">Δεν μπορείτε να ξεκινήσετε χωρίς εγκυρότητα — ελέγξτε στήλες (τουλ. ένα <strong>Τηλέφωνο</strong>)</p>}
                      <div className="mt-4 flex flex-wrap justify-between gap-2">
                        <button type="button" onClick={() => setStep(2)} className={lux.btnSecondary + " !py-2 text-sm"}>
                          Πίσω
                        </button>
                        <button
                          type="button"
                          onClick={runImport}
                          disabled={summaryToImport === 0}
                          className={lux.btnBlue + " !py-2 text-sm disabled:opacity-40"}
                        >
                          Έναρξη εισαγωγής
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 3 && importing && (
                    <div className="p-6 text-center">
                      <p className="text-sm text-[#94A3B8]">Εισαγωγή…</p>
                      <div className="mt-3 h-2.5 w-full max-w-sm mx-auto overflow-hidden rounded-full bg-[#162540]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#003476] to-[#C9A84C] transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-[#94A3B8]">{progress}%</p>
                    </div>
                  )}

                </>
              )}

              {step === 4 && result && (
                <div className="p-4">
                  <p className="text-center text-lg font-bold text-white">
                    <span className="text-emerald-300">{result.inserted}</span> εισήχθησαν,{" "}
                    <span className="text-amber-200/95">{result.errors}</span> σφάλματα
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
          </div>,
          document.body,
        )}
    </>
  );
}
