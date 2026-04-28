"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileUp,
  FileText,
  Image as ImageIcon,
  File,
  FileType,
  Save,
  Download,
  Trash2,
  Upload,
} from "lucide-react";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type Analysis = {
  title: string;
  summary: string;
  key_points: string[];
  relevance_to_aitoloakarnania: string;
  recommended_actions: string[];
  sentiment: string;
  analysis?: Record<string, unknown>;
};

type DocFileRow = {
  id: string;
  name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  uploader_name: string | null;
  signed_url: string | null;
};

type DocRow = {
  id: string;
  title: string | null;
  content_summary: string | null;
  key_points: unknown;
  analysis: unknown;
  created_at: string;
};

type FileFilter = "all" | "pdf" | "image" | "other";

function formatSize(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileCategory(ft: string | null, name: string): "pdf" | "image" | "other" {
  const t = (ft ?? "").toLowerCase();
  if (t.includes("pdf") || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (t.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|bmp|heic)$/i.test(name)) return "image";
  return "other";
}

function fileIconCategory(ft: string | null, name: string): "pdf" | "image" | "word" | "other" {
  const t = (ft ?? "").toLowerCase();
  if (t.includes("pdf") || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (t.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|bmp|heic)$/i.test(name)) return "image";
  if (t.includes("word") || t.includes("msword") || t.includes("officedocument") || /\.docx?$/i.test(name)) {
    return "word";
  }
  return "other";
}

function FileTypeIconV2({ ft, name }: { ft: string | null; name: string }) {
  const k = fileIconCategory(ft, name);
  if (k === "pdf") {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
        <FileText className="h-6 w-6" />
      </div>
    );
  }
  if (k === "image") {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
        <ImageIcon className="h-6 w-6" />
      </div>
    );
  }
  if (k === "word") {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30">
        <FileType className="h-6 w-6" />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30">
      <File className="h-6 w-6" />
    </div>
  );
}

function uploadFileXHR(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents/upload");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((100 * e.loaded) / e.total));
      }
    };
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText || "{}") as { error?: string };
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: j.error ?? "Σφάλμα αποστολής" });
        }
      } catch {
        resolve({ ok: false, error: "Άκυρη απάντηση" });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Σφάλμα δικτύου" });
    const fd = new FormData();
    fd.set("file", file);
    fd.set("library", "1");
    xhr.send(fd);
  });
}

export default function DocumentsPage() {
  const { profile } = useProfile();
  const router = useRouter();
  const can = hasMinRole(profile?.role, "manager");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"files" | "analyze">("files");
  const [files, setFiles] = useState<DocFileRow[]>([]);
  const [fFilter, setFFilter] = useState<FileFilter>("all");
  const [loadBusy, setLoadBusy] = useState(false);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [title, setTitle] = useState("Έγγραφο");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<DocRow[]>([]);
  const [drag, setDrag] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!can) return;
    setLoadBusy(true);
    try {
      const res = await fetchWithTimeout("/api/documents");
      if (!res.ok) return;
      const j = (await res.json()) as { documents?: DocFileRow[] };
      setFiles(j.documents ?? []);
    } finally {
      setLoadBusy(false);
    }
  }, [can]);

  const loadHistory = useCallback(async () => {
    const res = await fetchWithTimeout("/api/documents/history");
    if (!res.ok) return;
    const j = (await res.json()) as { documents?: DocRow[] };
    setHistory(j.documents ?? []);
  }, []);

  useEffect(() => {
    if (!can) return;
    void loadFiles();
  }, [can, loadFiles]);

  useEffect(() => {
    if (!can) return;
    if (tab !== "analyze") return;
    void loadHistory();
  }, [can, tab, loadHistory]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = files.filter((f) => {
    if (fFilter === "all") return true;
    const c = fileCategory(f.file_type, f.name);
    if (fFilter === "pdf") return c === "pdf";
    if (fFilter === "image") return c === "image";
    return c === "other";
  });

  const pickAndUpload = () => fileInputRef.current?.click();

  const onPickFiles = async (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    setErr(null);
    setUpPct(0);
    const r = await uploadFileXHR(f, setUpPct);
    setUpPct(null);
    if (r.ok) {
      setToast("Το αρχείο μεταφορτώθηκε.");
      void loadFiles();
    } else {
      setErr(r.error ?? "Αποτυχία");
    }
  };

  const delDoc = async (id: string) => {
    if (!confirm("Διαγραφή αρχείου από το αποθετήριο;")) return;
    const res = await fetchWithTimeout(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast("Διαγράφηκε.");
      void loadFiles();
    } else {
      setErr("Αποτυχία διαγραφής");
    }
  };

  const extractPdf = async (f: File) => {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetchWithTimeout("/api/contacts/extract-pdf", { method: "POST", body: fd });
      const j = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα PDF");
        return;
      }
      setText((j.text ?? "").trim() || text);
      if (f.name) {
        setTitle(f.name.replace(/\.pdf$/i, ""));
      }
    } catch {
      setErr("Σφάλμα ανάγνωσης");
    } finally {
      setBusy(false);
    }
  };

  const onFilesAnalyze = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.name.toLowerCase().endsWith(".pdf")) {
      void extractPdf(f);
    } else if (f && f.type.startsWith("text/")) {
      f.text().then((t) => setText(t)).catch(() => setErr("Άνοιγμα αρχείου"));
    }
  };

  const analyze = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title }),
      });
      const j = (await res.json()) as Analysis & { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        setResult(null);
        return;
      }
      setResult(j);
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setBusy(false);
    }
  };

  const saveAnalysis = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/documents/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title || title,
          content_summary: result.summary,
          key_points: result.key_points,
          analysis: {
            ...result,
            ...result.analysis,
            sentiment: result.sentiment,
          },
        }),
      });
      if (!res.ok) {
        setErr("Αποτυχία αποθήκευσης");
        return;
      }
      setToast("Η ανάλυση αποθηκεύτηκε.");
      void loadHistory();
    } finally {
      setBusy(false);
    }
  };

  const openLetter = () => {
    if (!result) return;
    const ctx = {
      fromDocument: true,
      summary: result.summary,
      key_points: result.key_points,
      relevance: result.relevance_to_aitoloakarnania,
    };
    try {
      sessionStorage.setItem("contentLetterContext", JSON.stringify(ctx));
    } catch {
      /* ignore */
    }
    router.push("/content?tab=letters");
  };

  if (!can) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="w-full min-w-0 max-w-6xl space-y-6 px-4 py-2 sm:px-0">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] max-w-sm rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-sm text-emerald-100 shadow-lg">
          {toast}
        </div>
      )}

      <header>
        <h1 className={lux.pageTitle}>Έγγραφα</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
          Αποθήκη αρχείων στο Supabase (bucket <code className="rounded bg-[var(--bg-elevated)] px-1 text-xs">documents</code>), λήψη με ασφαλή σύνδεσμο και ανάλυση PDF/κειμένου με AI.
        </p>
      </header>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-1">
        {(
          [
            { id: "files" as const, label: "Αρχεία" },
            { id: "analyze" as const, label: "Ανάλυση AI" },
          ] as const
        ).map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setTab(b.id)}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              tab === b.id
                ? "bg-[#003476] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            ].join(" ")}
          >
            {b.label}
          </button>
        ))}
      </div>

      {err && <p className="text-sm text-red-300">{err}</p>}

      {tab === "files" && (
        <div className="space-y-6">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              void onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div
            className={[
              "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 transition-all sm:min-h-[220px]",
              drag
                ? "border-[#C9A84C] bg-[#C9A84C]/10 shadow-[0_0_0_1px_rgba(201,168,76,0.35)]"
                : "border-[var(--border)] bg-[var(--bg-card)]/60 hover:border-[#C9A84C]/50 hover:bg-[var(--bg-elevated)]/30",
            ].join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void onPickFiles(e.dataTransfer.files);
            }}
            onClick={pickAndUpload}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") pickAndUpload();
            }}
            role="button"
            tabIndex={0}
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#C9A84C]/25 to-[#003476]/20 ring-1 ring-[var(--border)]">
              <Upload className="h-8 w-8 text-[#C9A84C]" />
            </div>
            <p className="text-center text-base font-semibold text-[var(--text-primary)]">Σύρετε & αφήστε αρχεία εδώ</p>
            <p className="mt-1 text-center text-sm text-[var(--text-secondary)]">ή κλικ για επιλογή · έως 50MB</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pickAndUpload();
              }}
              className={lux.btnPrimary + " mt-6 inline-flex items-center gap-2"}
              disabled={upPct !== null}
            >
              <FileUp className="h-4 w-4" />
              {upPct !== null ? `Μεταφόρτωση ${upPct}%` : "Επιλογή αρχείου"}
            </button>
            {upPct !== null && (
              <div className="absolute bottom-4 left-4 right-4 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                <div
                  className="h-full bg-gradient-to-r from-[#003476] to-[#C9A84C] transition-all duration-200"
                  style={{ width: `${upPct}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all" as const, label: "Όλα" },
                { id: "pdf" as const, label: "PDF" },
                { id: "image" as const, label: "Εικόνες" },
                { id: "other" as const, label: "Άλλα" },
              ] as const
            ).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setFFilter(b.id)}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-semibold",
                  fFilter === b.id
                    ? "bg-[#C9A84C]/20 text-[#E8C96B] ring-1 ring-[#C9A84C]/50"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
                ].join(" ")}
              >
                {b.label}
              </button>
            ))}
          </div>

          {loadBusy && <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>}

          {filtered.length === 0 && !loadBusy && (
            <div className="data-hq-card flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center">
              <div className="mb-4 text-[var(--text-muted)]">
                <FileUp className="mx-auto h-16 w-16 opacity-50" />
                <svg className="mx-auto mt-2 h-24 w-32 opacity-30" viewBox="0 0 120 80" fill="none" aria-hidden>
                  <rect x="8" y="8" width="104" height="64" rx="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M28 52 L48 32 L64 48 L80 24 L100 40" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Δεν υπάρχουν αρχεία</p>
              <p className="mt-1 max-w-sm text-xs text-[var(--text-secondary)]">Ανεβάστε ένα έγγραφο για εμφάνιση εδώ.</p>
              <button type="button" className={lux.btnPrimary + " mt-4"} onClick={pickAndUpload}>
                Ανεβάστε τώρα
              </button>
            </div>
          )}

          {filtered.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((d) => {
                return (
                  <li
                    key={d.id}
                    className="data-hq-card group flex min-h-[5.5rem] flex-col gap-3 rounded-2xl p-4 transition hover:border-[#C9A84C]/40 sm:flex-row sm:items-stretch"
                  >
                    <FileTypeIconV2 ft={d.file_type} name={d.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]" title={d.name}>
                        {d.name}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                        {formatSize(d.file_size)} · {new Date(d.created_at).toLocaleString("el-GR")}{" "}
                        {d.uploader_name ? `· ${d.uploader_name}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col justify-center gap-1.5 sm:flex-row sm:items-center">
                      {d.signed_url ? (
                        <a
                          href={d.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={lux.btnSecondary + " !px-2.5 !py-1.5 !text-xs inline-flex items-center gap-1"}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Λήψη
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void delDoc(d.id)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Διαγραφή
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Link href="/content" className={lux.btnSecondary + " inline-block"}>
            Περιεχόμενο
          </Link>
        </div>
      )}

      {tab === "analyze" && (
        <div className="grid min-h-0 w-full min-w-0 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase text-[var(--text-muted)]">Κείμενο & PDF</h2>
            <p className="text-sm text-[var(--text-secondary)]">Ανέβασμα PDF ή επικόλληση κειμένου — ανάλυση.</p>

            <div
              className={[
                "flex min-h-[6rem] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 transition-colors",
                drag ? "border-[var(--accent-gold)] bg-[var(--bg-elevated)]" : "border-[var(--border)]",
              ].join(" ")}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                onFilesAnalyze(e.dataTransfer.files);
              }}
            >
              <FileUp className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
              <p className="text-center text-sm text-[var(--text-secondary)]">Σύρετε PDF ή .txt</p>
              <input
                type="file"
                className="mt-3 max-w-full text-xs"
                accept=".pdf,.txt"
                onChange={(e) => onFilesAnalyze(e.target.files)}
              />
            </div>

            <div>
              <label className={lux.label} htmlFor="doc-title">
                Τίτλος
              </label>
              <input id="doc-title" className={lux.input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={lux.label} htmlFor="doc-body">
                Κείμενο
              </label>
              <textarea
                id="doc-body"
                className={lux.input + " min-h-[12rem] font-mono text-sm leading-relaxed"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Επικόλληση…"
              />
            </div>
            <button type="button" className={lux.btnPrimary} disabled={busy || !text.trim()} onClick={() => void analyze()}>
              {busy ? "Ανάλυση…" : "Ανάλυση εγγράφου"}
            </button>
          </div>

          <div className="space-y-3">
            {result && (
              <div className="data-hq-card space-y-3 p-4">
                <h2 className={lux.sectionTitle + " !mb-0"}>Αποτέλεσμα</h2>
                <div className="rounded-lg bg-[var(--bg-elevated)]/80 p-3 text-sm text-[var(--text-primary)]">
                  <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">Περίληψη</p>
                  <p className="mt-1 whitespace-pre-wrap">{result.summary}</p>
                </div>
                {result.key_points?.length ? (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)]">Κύρια σημεία</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-primary)]">
                      {result.key_points.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="text-xs font-semibold text-[var(--text-muted)]">Σχέση με Αιτωλοακαρνανία</p>
                <p className="text-sm text-[var(--text-primary)]">{result.relevance_to_aitoloakarnania}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={lux.btnSecondary + " inline-flex items-center gap-1"}
                    onClick={() => void saveAnalysis()}
                    disabled={busy}
                  >
                    <Save className="h-4 w-4" />
                    Αποθήκευση
                  </button>
                  <button type="button" className={lux.btnPrimary} onClick={openLetter} disabled={busy}>
                    Σύνταξη απάντησης
                  </button>
                </div>
              </div>
            )}

            <div>
              <h2 className={lux.sectionTitle}>Πρόσφατες αναλύσεις (AI)</h2>
              <ul className="space-y-2">
                {history.map((d) => (
                  <li key={d.id} className="data-hq-card p-3 text-sm">
                    <p className="font-medium text-[var(--text-primary)]">{d.title || "Άνευ τίτλου"}</p>
                    <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {d.content_summary || "—"} · {new Date(d.created_at).toLocaleString("el-GR")}
                    </p>
                  </li>
                ))}
              </ul>
              {history.length === 0 && <p className="text-sm text-[var(--text-muted)]">Καμία αποθηκευμένη ανάλυση.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
