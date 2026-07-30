import { describe, expect, it } from "vitest";
import {
  CONTACT_DOC_MAX_BYTES,
  contactDocIconKind,
  contactDocPreviewKind,
  contactDocumentRejectReason,
  documentsStorageObjectPath,
  formatFileSize,
  isAllowedContactDocument,
} from "./contact-documents";

describe("contact-documents", () => {
  it("allows listed extensions and mime types", () => {
    expect(isAllowedContactDocument({ name: "a.pdf", type: "" })).toBe(true);
    expect(isAllowedContactDocument({ name: "a.docx", type: "" })).toBe(true);
    expect(isAllowedContactDocument({ name: "a.xlsx", type: "" })).toBe(true);
    expect(isAllowedContactDocument({ name: "photo.jpg", type: "image/jpeg" })).toBe(true);
    expect(isAllowedContactDocument({ name: "x", type: "application/pdf" })).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isAllowedContactDocument({ name: "a.exe", type: "" })).toBe(false);
    expect(isAllowedContactDocument({ name: "a.zip", type: "application/zip" })).toBe(false);
  });

  it("rejects oversized files", () => {
    const reason = contactDocumentRejectReason({
      name: "big.pdf",
      type: "application/pdf",
      size: CONTACT_DOC_MAX_BYTES + 1,
    });
    expect(reason).toMatch(/10MB/);
  });

  it("maps icon and preview kinds", () => {
    expect(contactDocIconKind("application/pdf", "x.pdf")).toBe("pdf");
    expect(contactDocIconKind(null, "memo.docx")).toBe("word");
    expect(contactDocIconKind(null, "sheet.xlsx")).toBe("excel");
    expect(contactDocIconKind("image/png", "a.png")).toBe("image");
    expect(contactDocPreviewKind(null, "a.pdf")).toBe("pdf");
    expect(contactDocPreviewKind("image/jpeg", "a.jpg")).toBe("image");
    expect(contactDocPreviewKind(null, "a.docx")).toBe("unsupported");
  });

  it("formats sizes", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("extracts storage object paths from plain paths and URLs", () => {
    expect(documentsStorageObjectPath("crm/user/1-a.pdf")).toBe("crm/user/1-a.pdf");
    expect(documentsStorageObjectPath("/documents/crm/user/1-a.pdf")).toBe("crm/user/1-a.pdf");
    expect(
      documentsStorageObjectPath(
        "https://viibonjvztoczcrftdea.supabase.co/storage/v1/object/public/documents/crm/u/f.pdf",
      ),
    ).toBe("crm/u/f.pdf");
    expect(
      documentsStorageObjectPath(
        "https://viibonjvztoczcrftdea.supabase.co/storage/v1/object/sign/documents/crm/u/f%20x.pdf?token=abc",
      ),
    ).toBe("crm/u/f x.pdf");
    expect(
      documentsStorageObjectPath(
        "https://example.supabase.co/storage/v1/object/authenticated/documents/crm/u/a.pdf",
      ),
    ).toBe("crm/u/a.pdf");
    expect(documentsStorageObjectPath("")).toBeNull();
    expect(documentsStorageObjectPath(null)).toBeNull();
  });
});
