/** Contact-detail document upload rules and display helpers. */

export const CONTACT_DOC_MAX_BYTES = 10 * 1024 * 1024;

export const CONTACT_DOC_ACCEPT_ATTR =
  ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/gif";

const EXT_ALLOW = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "gif",
]);

const MIME_ALLOW = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
]);

export type ContactDocIconKind = "pdf" | "word" | "excel" | "image" | "other";

export type ContactDocPreviewKind = "pdf" | "image" | "unsupported";

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
}

export function isAllowedContactDocument(file: { name: string; type?: string | null }): boolean {
  const ext = fileExtension(file.name);
  if (ext && EXT_ALLOW.has(ext)) return true;
  const mime = (file.type ?? "").toLowerCase().trim();
  return Boolean(mime && MIME_ALLOW.has(mime));
}

export function contactDocumentRejectReason(file: { name: string; type?: string | null; size: number }): string | null {
  if (file.size > CONTACT_DOC_MAX_BYTES) {
    return `Το αρχείο "${file.name}" υπερβαίνει το όριο 10MB.`;
  }
  if (!isAllowedContactDocument(file)) {
    return `Μη αποδεκτός τύπος αρχείου: "${file.name}". Επιτρέπονται PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, GIF.`;
  }
  return null;
}

export function formatFileSize(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function contactDocIconKind(fileType: string | null | undefined, name: string): ContactDocIconKind {
  const t = (fileType ?? "").toLowerCase();
  const ext = fileExtension(name);
  if (t.includes("pdf") || ext === "pdf") return "pdf";
  if (
    t.includes("spreadsheet") ||
    t.includes("excel") ||
    t === "application/vnd.ms-excel" ||
    ext === "xls" ||
    ext === "xlsx"
  ) {
    return "excel";
  }
  if (
    t.includes("word") ||
    t.includes("msword") ||
    t.includes("wordprocessingml") ||
    ext === "doc" ||
    ext === "docx"
  ) {
    return "word";
  }
  if (t.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
    return "image";
  }
  return "other";
}

export function contactDocPreviewKind(fileType: string | null | undefined, name: string): ContactDocPreviewKind {
  const t = (fileType ?? "").toLowerCase();
  const ext = fileExtension(name);
  if (t.includes("pdf") || ext === "pdf") return "pdf";
  if (
    t.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)
  ) {
    return "image";
  }
  return "unsupported";
}

const DOCUMENTS_BUCKET = "documents";

/** Greek letters → Latin approximations (NFD alone does not transliterate Greek). */
const GREEK_TO_LATIN: Record<string, string> = {
  α: "a",
  ά: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  έ: "e",
  ζ: "z",
  η: "i",
  ή: "i",
  θ: "th",
  ι: "i",
  ί: "i",
  ϊ: "i",
  ΐ: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  ό: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  ύ: "y",
  ϋ: "y",
  ΰ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
  ώ: "o",
};

function transliterateGreek(s: string): string {
  let out = "";
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const mapped = GREEK_TO_LATIN[lower];
    if (mapped) {
      out += ch === lower ? mapped : mapped.toUpperCase();
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * ASCII-safe filename for Supabase Storage object keys.
 * Keeps the extension; callers should store the original name in DB for display.
 */
export function sanitizeStorageFilename(filename: string): string {
  const raw = (filename ?? "").trim();
  const lastDot = raw.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < raw.length - 1;
  const baseRaw = hasExt ? raw.slice(0, lastDot) : raw || "document";
  const extRaw = hasExt ? raw.slice(lastDot + 1) : "";

  const toSegment = (part: string): string => {
    const stripped = part
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const latin = transliterateGreek(stripped);
    return latin
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  };

  const base = toSegment(baseRaw) || "document";
  const ext = extRaw ? toSegment(extRaw) : "";
  return ext ? `${base}.${ext}` : base;
}

/**
 * Normalize `documents.file_url` for `storage.from('documents').download/createSignedUrl`.
 * Accepts plain object paths (`crm/…/file.pdf`) and full Supabase public/signed URLs.
 */
export function documentsStorageObjectPath(
  fileUrlOrPath: string | null | undefined,
  bucket: string = DOCUMENTS_BUCKET,
): string | null {
  const raw = (fileUrlOrPath ?? "").trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    let path = raw.replace(/^\/+/, "");
    if (path.startsWith(`${bucket}/`)) {
      path = path.slice(bucket.length + 1);
    }
    return path || null;
  }

  try {
    const u = new URL(raw);
    const objectMatch = u.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
    );
    if (objectMatch) {
      const pathBucket = decodeURIComponent(objectMatch[1] ?? "");
      const objectPath = decodeURIComponent(objectMatch[2] ?? "");
      if (!objectPath) return null;
      if (pathBucket && pathBucket !== bucket) {
        console.warn("[documentsStorageObjectPath] bucket mismatch", {
          expected: bucket,
          found: pathBucket,
        });
      }
      return objectPath;
    }

    const marker = `/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      const objectPath = decodeURIComponent(u.pathname.slice(idx + marker.length));
      return objectPath || null;
    }
  } catch {
    return null;
  }

  return null;
}
