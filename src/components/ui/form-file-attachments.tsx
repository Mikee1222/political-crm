"use client";

import { Paperclip, X } from "lucide-react";
import { useId, useRef } from "react";
import {
  CONTACT_DOC_ACCEPT_ATTR,
  contactDocumentRejectReason,
  formatFileSize,
} from "@/lib/contact-documents";
import { lux } from "@/lib/luxury-styles";

export type FormFileAttachmentsProps = {
  files: File[];
  onChange: (files: File[]) => void;
  /** Called when validation fails (or cleared when selection succeeds). */
  onError?: (message: string | null) => void;
  error?: string | null;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * Pending file chips for create forms — select/validate only; upload happens after entity create.
 */
export function FormFileAttachments({
  files,
  onChange,
  onError,
  error,
  disabled,
  id: idProp,
  className,
}: FormFileAttachmentsProps) {
  const autoId = useId();
  const inputId = idProp ?? `form-files-${autoId}`;
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files];
    const rejects: string[] = [];
    for (const f of Array.from(list)) {
      const reason = contactDocumentRejectReason(f);
      if (reason) {
        rejects.push(reason);
        continue;
      }
      const dup = next.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified);
      if (!dup) next.push(f);
    }
    if (rejects.length) {
      onError?.(rejects.join(" "));
    } else {
      onError?.(null);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
    onError?.(null);
  };

  return (
    <div className={className}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-gold)]">
        Έγγραφα
      </div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        Προαιρετικά · PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, GIF · έως 10MB
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        multiple
        accept={CONTACT_DOC_ACCEPT_ATTR}
        disabled={disabled}
        onChange={(e) => addFiles(e.target.files)}
      />

      <button
        type="button"
        className={lux.btnSecondary + " !min-h-[40px] !px-3 !py-2 text-xs"}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden />
        Προσθήκη εγγράφου
      </button>

      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Επιλεγμένα αρχεία">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/60 py-1 pl-2.5 pr-1 text-xs text-[var(--text-primary)]"
            >
              <span className="min-w-0 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 text-[var(--text-muted)]">{formatFileSize(f.size)}</span>
              <button
                type="button"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] disabled:opacity-50"
                aria-label={`Αφαίρεση ${f.name}`}
                disabled={disabled}
                onClick={() => removeAt(i)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type PendingDocUploadResult = {
  name: string;
  ok: boolean;
  error?: string;
};

/** Upload each pending file to an entity documents POST endpoint (`file` form field). */
export async function uploadPendingDocuments(
  documentsUrl: string,
  files: File[],
): Promise<PendingDocUploadResult[]> {
  const results: PendingDocUploadResult[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(documentsUrl, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        results.push({
          name: file.name,
          ok: false,
          error: j.error ?? `Αποτυχία μεταφόρτωσης: ${file.name}`,
        });
      } else {
        results.push({ name: file.name, ok: true });
      }
    } catch {
      results.push({ name: file.name, ok: false, error: `Σφάλμα δικτύου: ${file.name}` });
    }
  }
  return results;
}

/** Toast summary helpers after create + optional uploads. */
export function reportPendingUploadResults(
  results: PendingDocUploadResult[],
  showToast: (message: string, variant: "success" | "error") => void,
): void {
  for (const r of results) {
    if (r.ok) {
      showToast(`Το αρχείο «${r.name}» ανέβηκε επιτυχώς.`, "success");
    } else {
      showToast(r.error ?? `Αποτυχία: ${r.name}`, "error");
    }
  }
}
