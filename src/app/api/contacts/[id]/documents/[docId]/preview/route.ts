import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
import { fileExtension } from "@/lib/contact-documents";

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
    const { data: row, error: fe } = await admin
      .from("documents")
      .select("id, contact_id, name, file_url, file_type")
      .eq("id", docId)
      .eq("contact_id", contactId)
      .maybeSingle();

    if (fe) {
      return NextResponse.json({ error: fe.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Άκυρο έγγραφο" }, { status: 404 });
    }

    const doc = row as {
      id: string;
      contact_id: string;
      name: string;
      file_url: string;
      file_type: string | null;
    };

    if (!doc.file_url) {
      return NextResponse.json({ error: "Λείπει το αρχείο" }, { status: 404 });
    }

    const { data: blob, error: dlErr } = await admin.storage.from("documents").download(doc.file_url);
    if (dlErr || !blob) {
      console.error("[documents preview download]", dlErr?.message);
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
