"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  FileX,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { formatDateTimeAthens } from "@/lib/date-format";
import {
  CONTACT_DOC_ACCEPT_ATTR,
  contactDocIconKind,
  contactDocPreviewKind,
  contactDocumentRejectReason,
  formatFileSize,
  type ContactDocIconKind,
} from "@/lib/contact-documents";
import { lux } from "@/lib/luxury-styles";
import { useFormToast } from "@/contexts/form-toast-context";

const DOCS_FETCH_TIMEOUT_MS = 20_000;

async function fetchContactDocumentsList(contactId: string): Promise<{
  documents: ContactDocRow[];
  error: string | null;
  source: "scoped" | "fallback" | "none";
}> {
  const scopedUrl = `/api/contacts/${encodeURIComponent(contactId)}/documents`;
  console.log("[contact-documents] fetch called", { contactId, url: scopedUrl });

  const parseDocs = async (res: Response): Promise<ContactDocRow[]> => {
    const j = (await res.json()) as { documents?: ContactDocRow[] };
    return j.documents ?? [];
  };

  try {
    const dr = await fetchWithTimeout(scopedUrl, { timeoutMs: DOCS_FETCH_TIMEOUT_MS });
    console.log("[contact-documents] scoped response", { status: dr.status, ok: dr.ok });
    if (dr.ok) {
      const documents = await parseDocs(dr);
      console.log("[contact-documents] scoped body", { count: documents.length });
      return { documents, error: null, source: "scoped" };
    }

    let scopedErr = `Αποτυχία φόρτωσης εγγράφων (${dr.status})`;
    try {
      const ej = (await dr.clone().json()) as { error?: string };
      if (ej.error) scopedErr = ej.error;
    } catch {
      /* non-JSON (e.g. HTML 404) */
    }

    const fallbackUrl = `/api/documents?contact_id=${encodeURIComponent(contactId)}`;
    console.log("[contact-documents] scoped failed, trying fallback", {
      status: dr.status,
      fallbackUrl,
    });
    const fr = await fetchWithTimeout(fallbackUrl, { timeoutMs: DOCS_FETCH_TIMEOUT_MS });
    console.log("[contact-documents] fallback response", { status: fr.status, ok: fr.ok });
    if (fr.ok) {
      const documents = await parseDocs(fr);
      console.log("[contact-documents] fallback body", { count: documents.length });
      return { documents, error: null, source: "fallback" };
    }

    return { documents: [], error: scopedErr, source: "none" };
  } catch (e) {
    console.error("[contact-documents] fetch error", e);
    try {
      const fallbackUrl = `/api/documents?contact_id=${encodeURIComponent(contactId)}`;
      console.log("[contact-documents] network error, trying fallback", { fallbackUrl });
      const fr = await fetchWithTimeout(fallbackUrl, { timeoutMs: DOCS_FETCH_TIMEOUT_MS });
      console.log("[contact-documents] fallback response", { status: fr.status, ok: fr.ok });
      if (fr.ok) {
        const documents = await parseDocs(fr);
        return { documents, error: null, source: "fallback" };
      }
    } catch (e2) {
      console.error("[contact-documents] fallback error", e2);
    }
    return { documents: [], error: "Αποτυχία φόρτωσης εγγράφων", source: "none" };
  }
}

export type ContactDocRow = {
  id: string;
  name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  signed_url: string | null;
};

const GOLD = "#D4AF37";

function DocTypeIcon({ kind }: { kind: ContactDocIconKind }) {
  if (kind === "pdf") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
        <FileText className="h-5 w-5" aria-hidden />
      </div>
    );
  }
  if (kind === "word") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30">
        <FileType className="h-5 w-5" aria-hidden />
      </div>
    );
  }
  if (kind === "excel") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-400 ring-1 ring-emerald-600/30">
        <FileSpreadsheet className="h-5 w-5" aria-hidden />
      </div>
    );
  }
  if (kind === "image") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
        <ImageIcon className="h-5 w-5" aria-hidden />
      </div>
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30">
      <File className="h-5 w-5" aria-hidden />
    </div>
  );
}

function postDocumentXHR(
  url: string,
  fd: FormData,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; document?: ContactDocRow; error?: string; status: number }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((100 * e.loaded) / e.total));
      }
    };
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText || "{}") as {
          error?: string;
          document?: ContactDocRow;
        };
        if (xhr.status >= 200 && xhr.status < 300 && j.document) {
          resolve({ ok: true, document: j.document, status: xhr.status });
        } else {
          resolve({
            ok: false,
            error: j.error ?? "Σφάλμα αποστολής",
            status: xhr.status,
          });
        }
      } catch {
        resolve({ ok: false, error: "Άκυρη απάντηση", status: xhr.status });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Σφάλμα δικτύου", status: 0 });
    xhr.send(fd);
  });
}

async function uploadContactDocXHR(
  file: File,
  contactId: string,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; document?: ContactDocRow; error?: string }> {
  const scopedUrl = `/api/contacts/${encodeURIComponent(contactId)}/documents`;
  console.log("[contact-documents] upload called", { contactId, url: scopedUrl, name: file.name });
  const fd = new FormData();
  fd.set("file", file);
  const scoped = await postDocumentXHR(scopedUrl, fd, onProgress);
  console.log("[contact-documents] upload scoped response", {
    ok: scoped.ok,
    status: scoped.status,
    error: scoped.error,
  });
  if (scoped.ok) return scoped;

  // Scoped route missing (404) or hard fail — fall back to legacy upload.
  if (scoped.status === 404 || scoped.status === 405 || scoped.status === 0) {
    const legacyUrl = "/api/documents/upload";
    console.log("[contact-documents] upload fallback", { legacyUrl });
    const legacyFd = new FormData();
    legacyFd.set("file", file);
    legacyFd.set("contact_id", contactId);
    const legacy = await postDocumentXHR(legacyUrl, legacyFd, onProgress);
    console.log("[contact-documents] upload fallback response", {
      ok: legacy.ok,
      status: legacy.status,
      error: legacy.error,
    });
    return legacy;
  }

  return scoped;
}

type PreviewLoadState = "loading" | "loaded" | "error";

function PreviewErrorOverlay({
  downloadUrl,
  name,
}: {
  downloadUrl: string | null;
  name: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex min-h-[240px] flex-col items-center justify-center gap-4 bg-[#0b1220] px-6 py-16 text-center">
      <FileX className="h-10 w-10 text-[var(--text-muted)]" aria-hidden />
      <p className="max-w-sm text-sm text-[var(--text-secondary)]">
        Δεν ήταν δυνατή η προεπισκόπηση.
      </p>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download={name}
          target="_blank"
          rel="noreferrer"
          className={lux.btnPrimary + " inline-flex items-center gap-2"}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Λήψη
        </a>
      ) : null}
    </div>
  );
}

function PdfPreviewPane({
  proxyUrl,
  downloadUrl,
  name,
}: {
  proxyUrl: string;
  downloadUrl: string | null;
  name: string;
}) {
  const [loadState, setLoadState] = useState<PreviewLoadState>("loading");
  const loadStateRef = useRef<PreviewLoadState>("loading");

  useEffect(() => {
    loadStateRef.current = "loading";
    setLoadState("loading");
    const t = window.setTimeout(() => {
      if (loadStateRef.current !== "loading") return;
      loadStateRef.current = "error";
      setLoadState("error");
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [proxyUrl]);

  const markLoaded = () => {
    loadStateRef.current = "loaded";
    setLoadState("loaded");
  };

  const markError = () => {
    loadStateRef.current = "error";
    setLoadState("error");
  };

  return (
    <div className="relative min-h-[600px] h-[70vh] w-full bg-white">
      {loadState === "loading" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b1220]/80">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" aria-hidden />
          <span className="sr-only">Φόρτωση προεπισκόπησης</span>
        </div>
      ) : null}
      {loadState === "error" ? (
        <PreviewErrorOverlay downloadUrl={downloadUrl} name={name} />
      ) : null}
      <object
        data={proxyUrl}
        type="application/pdf"
        width="100%"
        height="600px"
        className="h-full min-h-[600px] w-full"
        style={{ display: loadState === "loaded" ? "block" : "none" }}
        onLoad={markLoaded}
        onError={markError}
      >
        <embed
          title={name}
          src={proxyUrl}
          type="application/pdf"
          width="100%"
          height="600px"
          className="h-full min-h-[600px] w-full"
          onLoad={markLoaded}
          onError={markError}
        />
        {downloadUrl ? (
          <a href={downloadUrl} download={name} target="_blank" rel="noreferrer">
            Λήψη {name}
          </a>
        ) : (
          <a href={proxyUrl} target="_blank" rel="noreferrer">
            Άνοιγμα {name}
          </a>
        )}
      </object>
    </div>
  );
}

function ImagePreviewPane({
  proxyUrl,
  downloadUrl,
  name,
}: {
  proxyUrl: string;
  downloadUrl: string | null;
  name: string;
}) {
  const [loadState, setLoadState] = useState<PreviewLoadState>("loading");
  const loadStateRef = useRef<PreviewLoadState>("loading");

  useEffect(() => {
    loadStateRef.current = "loading";
    setLoadState("loading");
    const t = window.setTimeout(() => {
      if (loadStateRef.current !== "loading") return;
      loadStateRef.current = "error";
      setLoadState("error");
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [proxyUrl]);

  return (
    <div className="relative flex min-h-[240px] items-center justify-center">
      {loadState === "loading" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b1220]/80">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" aria-hidden />
          <span className="sr-only">Φόρτωση προεπισκόπησης</span>
        </div>
      ) : null}
      {loadState === "error" ? (
        <PreviewErrorOverlay downloadUrl={downloadUrl} name={name} />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxyUrl}
        alt={name}
        className="mx-auto max-h-[70vh] w-auto max-w-full object-contain p-4"
        style={{ display: loadState === "loaded" ? "block" : "none" }}
        onLoad={() => {
          loadStateRef.current = "loaded";
          setLoadState("loaded");
        }}
        onError={() => {
          loadStateRef.current = "error";
          setLoadState("error");
        }}
      />
    </div>
  );
}

function PreviewModal({
  doc,
  contactId,
  onClose,
  onSignedUrl,
}: {
  doc: ContactDocRow;
  contactId: string;
  onClose: () => void;
  onSignedUrl?: (id: string, signedUrl: string) => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(doc.signed_url);
  const kind = contactDocPreviewKind(doc.file_type, doc.name);
  const proxyUrl = `/api/contacts/${contactId}/documents/${doc.id}/preview`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function ensureSignedUrl() {
      if (doc.signed_url) {
        setFileUrl(doc.signed_url);
        return;
      }
      try {
        const { documents } = await fetchContactDocumentsList(contactId);
        const fresh = documents.find((d) => d.id === doc.id);
        const url = fresh?.signed_url ?? null;
        if (!cancelled) {
          setFileUrl(url);
          if (url) onSignedUrl?.(doc.id, url);
        }
      } catch {
        if (!cancelled) setFileUrl(null);
      }
    }
    void ensureSignedUrl();
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.signed_url, contactId, onSignedUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const showUnsupported = kind === "unsupported";
  const showImage = kind === "image";
  const showPdf = kind === "pdf";
  const downloadUrl = fileUrl ?? proxyUrl;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b1220] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">
            {doc.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            aria-label="Κλείσιμο"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-black/40">
          {showImage ? (
            <ImagePreviewPane proxyUrl={proxyUrl} downloadUrl={fileUrl} name={doc.name} />
          ) : null}
          {showPdf ? (
            <PdfPreviewPane proxyUrl={proxyUrl} downloadUrl={fileUrl} name={doc.name} />
          ) : null}
          {showUnsupported ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <FileX className="h-10 w-10 text-[var(--text-muted)]" aria-hidden />
              <p className="max-w-sm text-sm text-[var(--text-secondary)]">
                Δεν υποστηρίζεται προεπισκόπηση — κατεβάστε το αρχείο
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <a
            href={downloadUrl}
            download={doc.name}
            target="_blank"
            rel="noreferrer"
            className={lux.btnPrimary + " inline-flex items-center gap-2"}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Λήψη
          </a>
          <button type="button" className={lux.btnSecondary} onClick={onClose}>
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ContactDocumentsSection({ contactId }: { contactId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useFormToast();
  const [docs, setDocs] = useState<ContactDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContactDocRow | null>(null);

  const onPreviewSignedUrl = useCallback((id: string, signedUrl: string) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, signed_url: signedUrl } : d)),
    );
    setPreview((p) => (p && p.id === id ? { ...p, signed_url: signedUrl } : p));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchContactDocumentsList(contactId);
    setDocs(result.documents);
    if (result.error) {
      setError(result.error);
      showToast(result.error, "error");
      console.warn("[contact-documents] load failed", result);
    } else {
      setError(null);
      console.log("[contact-documents] load ok", {
        source: result.source,
        count: result.documents.length,
      });
    }
    setLoading(false);
  }, [contactId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(null), 3600);
    return () => window.clearTimeout(t);
  }, [success]);

  const openPicker = () => fileInputRef.current?.click();

  const uploadFiles = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setError(null);
    setSuccess(null);

    const valid: File[] = [];
    const rejects: string[] = [];
    for (const f of files) {
      const reason = contactDocumentRejectReason(f);
      if (reason) rejects.push(reason);
      else valid.push(f);
    }
    if (rejects.length) {
      setError(rejects.join(" "));
    }
    if (!valid.length) return;

    setUploading(true);
    let uploaded = 0;
    for (let i = 0; i < valid.length; i++) {
      const f = valid[i]!;
      setUploadLabel(valid.length > 1 ? `${i + 1}/${valid.length}: ${f.name}` : f.name);
      setUpPct(0);
      const r = await uploadContactDocXHR(f, contactId, setUpPct);
      if (r.ok && r.document) {
        uploaded += 1;
        setDocs((prev) => {
          if (prev.some((d) => d.id === r.document!.id)) return prev;
          return [r.document!, ...prev];
        });
      } else {
        const msg = r.error ?? "Η μεταφόρτωση απέτυχε.";
        setError(msg);
        showToast(msg, "error");
      }
    }
    setUpPct(null);
    setUploadLabel(null);
    setUploading(false);
    if (uploaded > 0) {
      setSuccess(
        uploaded === 1 ? "Το αρχείο ανέβηκε επιτυχώς." : `Ανέβηκαν ${uploaded} αρχεία επιτυχώς.`,
      );
    }
  };

  const delDoc = async (id: string) => {
    if (!confirm("Διαγραφή εγγράφου;")) return;
    const res = await fetchWithTimeout(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (preview?.id === id) setPreview(null);
    } else {
      setError("Αποτυχία διαγραφής.");
    }
  };

  return (
    <div className="contact-card-in break-inside-avoid rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)]/95 p-5 shadow-sm">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept={CONTACT_DOC_ACCEPT_ATTR}
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: GOLD }}
          >
            ΕΓΓΡΑΦΑ
          </h2>
          <span
            className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold text-[#0a0f1a]"
            style={{ backgroundColor: GOLD }}
            aria-label={`${docs.length} έγγραφα`}
          >
            {loading ? "…" : docs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={openPicker}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:brightness-110 disabled:opacity-50"
          style={{ borderColor: `${GOLD}88`, color: GOLD }}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Ανέβασμα
        </button>
      </div>

          {success ? <p className="mb-3 text-xs text-emerald-400">{success}</p> : null}
      {error ? <p className="mb-3 text-xs text-red-400">{error}</p> : null}

      {!loading && docs.length === 0 ? (
        <div
          className={[
            "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-all",
            drag
              ? "bg-[#D4AF37]/10 shadow-[0_0_0_1px_rgba(212,175,55,0.35)]"
              : "bg-[var(--bg-elevated)]/30 hover:bg-[var(--bg-elevated)]/50",
          ].join(" ")}
          style={{ borderColor: drag ? GOLD : `${GOLD}66` }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => {
            if (!uploading) openPicker();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!uploading) openPicker();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Ζώνη ανεβάσματος εγγράφων"
        >
          <div
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${GOLD}18`, color: GOLD, boxShadow: `inset 0 0 0 1px ${GOLD}33` }}
          >
            <FileX className="h-7 w-7" aria-hidden />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Δεν υπάρχουν έγγραφα</p>
          <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">
            Σύρετε αρχεία εδώ ή κάντε κλικ για επιλογή · PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, GIF · έως 10MB
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPicker();
            }}
            disabled={uploading}
            className={lux.btnPrimary + " mt-4 inline-flex items-center gap-2"}
          >
            <Upload className="h-4 w-4" />
            Ανεβάστε το πρώτο έγγραφο
          </button>
          {upPct !== null && (
            <div className="absolute bottom-3 left-3 right-3">
              {uploadLabel ? (
                <p className="mb-1 truncate text-[10px] text-[var(--text-muted)]">{uploadLabel}</p>
              ) : null}
              <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${upPct}%`,
                    background: `linear-gradient(90deg, #003476, ${GOLD})`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className={[
              "relative mb-4 flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 transition-all",
              drag
                ? "bg-[#D4AF37]/10 shadow-[0_0_0_1px_rgba(212,175,55,0.35)]"
                : "bg-[var(--bg-elevated)]/30 hover:bg-[var(--bg-elevated)]/50",
            ].join(" ")}
            style={{ borderColor: drag ? GOLD : `${GOLD}66` }}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => {
              if (!uploading) openPicker();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!uploading) openPicker();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Ζώνη ανεβάσματος εγγράφων"
          >
            <Upload className="mb-2 h-6 w-6" style={{ color: GOLD }} aria-hidden />
            <p className="text-center text-sm font-medium text-[var(--text-primary)]">
              Σύρετε αρχεία εδώ ή κάντε κλικ για επιλογή
            </p>
            <p className="mt-1 text-center text-xs text-[var(--text-muted)]">
              PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, GIF · έως 10MB
            </p>
            {upPct !== null && (
              <div className="absolute bottom-3 left-3 right-3">
                {uploadLabel ? (
                  <p className="mb-1 truncate text-[10px] text-[var(--text-muted)]">{uploadLabel}</p>
                ) : null}
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <div
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${upPct}%`,
                      background: `linear-gradient(90deg, #003476, ${GOLD})`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {docs.map((d) => {
              const kind = contactDocIconKind(d.file_type, d.name);
              return (
                <li
                  key={d.id}
                  className="group flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 transition-colors hover:border-[#D4AF37]"
                >
                  <DocTypeIcon kind={kind} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setPreview(d)}
                      className="block w-full truncate text-left text-sm font-bold text-[var(--text-primary)] hover:underline"
                      title={d.name}
                    >
                      {d.name}
                    </button>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {formatFileSize(d.file_size)} · {formatDateTimeAthens(d.created_at)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPreview(d)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                      style={{ color: GOLD }}
                    >
                      <Eye className="h-3 w-3" aria-hidden />
                      Προεπισκόπηση
                    </button>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    {d.signed_url ? (
                      <a
                        href={d.signed_url}
                        download={d.name}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-[var(--bg-card)]"
                        style={{ color: GOLD }}
                        title="Λήψη"
                        aria-label={`Λήψη ${d.name}`}
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-500/10"
                      onClick={() => void delDoc(d.id)}
                      title="Διαγραφή"
                      aria-label={`Διαγραφή ${d.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {preview ? (
        <PreviewModal
          doc={preview}
          contactId={contactId}
          onClose={() => setPreview(null)}
          onSignedUrl={onPreviewSignedUrl}
        />
      ) : null}
    </div>
  );
}
