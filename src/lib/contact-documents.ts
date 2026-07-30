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
