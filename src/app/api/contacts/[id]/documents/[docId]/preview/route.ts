import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
import { documentsStorageObjectPath, fileExtension } from "@/lib/contact-documents";

export const dynamic = "force-dynamic";

function guessContentType(fileType: string | null, name: string): string {
  const mime = (fileType ?? "").trim().toLowerCase();
  if (mime) return mime;
  const ext = fileExtension(name);
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return byExt[ext] ?? "application/octet-stream";
}

function inlineDisposition(name: string): string {
  const safe = name.replace(/[\r\n"]/g, "_");
  const encoded = encodeURIComponent(name);
  return `inline; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

type DocPreviewRow = {
  id: string;
  contact_id: string | null;
  name: string;
  file_url: string;
  file_type: string | null;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const { id: contactId, docId } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    if (!contactId || !docId) {
      return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
    }

    const admin = createServiceClient();
    const selectCols = "id, contact_id, name, file_url, file_type";

    const { data: owned, error: ownedErr } = await admin
      .from("documents")
      .select(selectCols)
      .eq("id", docId)
      .eq("contact_id", contactId)
      .maybeSingle();

    if (ownedErr) {
      return NextResponse.json({ error: ownedErr.message }, { status: 400 });
    }

    let doc = owned as DocPreviewRow | null;

    if (doc) {
      console.info("[documents preview] found with ownership", { docId, contactId });
    } else {
      console.warn("[documents preview] ownership miss, trying id-only", { docId, contactId });
      const { data: byId, error: byIdErr } = await admin
        .from("documents")
        .select(selectCols)
        .eq("id", docId)
        .maybeSingle();

      if (byIdErr) {
        return NextResponse.json({ error: byIdErr.message }, { status: 400 });
      }

      doc = (byId as DocPreviewRow | null) ?? null;
      if (!doc) {
        console.warn("[documents preview] not found", { docId, contactId });
        return NextResponse.json({ error: "Άκυρο έγγραφο" }, { status: 404 });
      }

      console.info("[documents preview] found by id", {
        docId,
        routeContactId: contactId,
        rowContactId: doc.contact_id,
      });
    }

    if (!doc.file_url) {
      return NextResponse.json({ error: "Λείπει το αρχείο" }, { status: 404 });
    }

    const filePath = documentsStorageObjectPath(doc.file_url);
    console.log("[preview]", { contactId, docId, filePath });
    if (!filePath) {
      console.error("[documents preview] invalid storage path", {
        docId,
        file_url_prefix: doc.file_url.slice(0, 80),
      });
      return NextResponse.json({ error: "Λείπει το αρχείο" }, { status: 404 });
    }

    const { data: blob, error: dlErr } = await admin.storage.from("documents").download(filePath);
    if (dlErr || !blob) {
      console.error("[documents preview download]", dlErr?.message, { filePath });
      return NextResponse.json({ error: "Αποτυχία ανάκτησης αρχείου" }, { status: 404 });
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const contentType = guessContentType(doc.file_type, doc.name);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": inlineDisposition(doc.name),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[api/contacts/documents/preview]", e);
    return nextJsonError();
  }
}
