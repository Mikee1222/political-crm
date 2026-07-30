import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
import {
  CONTACT_DOC_MAX_BYTES,
  contactDocumentRejectReason,
  documentsStorageObjectPath,
} from "@/lib/contact-documents";

export const dynamic = "force-dynamic";

type DocRow = {
  id: string;
  contact_id: string | null;
  request_id: string | null;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  uploaded_by: string | null;
};

async function documentsForContact(contactId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("documents")
    .select("id, contact_id, request_id, name, file_url, file_type, file_size, created_at, uploaded_by")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message as string, documents: null as null };
  }

  const rows = (data ?? []) as DocRow[];
  const uids = [...new Set(rows.map((r) => r.uploaded_by).filter(Boolean))] as string[];
  const nameById = new Map<string, string | null>();
  if (uids.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", uids);
    for (const p of profs ?? []) {
      const x = p as { id: string; full_name: string | null };
      nameById.set(x.id, x.full_name ?? null);
    }
  }

  const sc = await createClient();
  const documents = await Promise.all(
    rows.map(async (r) => {
      let signedUrl: string | null = null;
      const objectPath = documentsStorageObjectPath(r.file_url);
      if (objectPath) {
        const { data: s } = await sc.storage.from("documents").createSignedUrl(objectPath, 3600);
        signedUrl = s?.signedUrl ?? null;
        if (!signedUrl) {
          const { data: s2 } = await admin.storage.from("documents").createSignedUrl(objectPath, 3600);
          signedUrl = s2?.signedUrl ?? null;
        }
      }
      return {
        ...r,
        uploader_name: r.uploaded_by ? nameById.get(r.uploaded_by) ?? null : null,
        signed_url: signedUrl,
      };
    }),
  );

  return { error: null as null, documents };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contactId } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    if (!contactId) {
      return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
    }

    const result = await documentsForContact(contactId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ documents: result.documents });
  } catch (e) {
    console.error("[api/contacts/documents GET]", e);
    return nextJsonError();
  }
}

/** Upload a document scoped to this contact (`contact_id` always set; `file_url` = storage object path). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contactId } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    if (!contactId) {
      return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof Blob) || !file.size) {
      return NextResponse.json({ error: "Άκυρο αρχείο" }, { status: 400 });
    }

    const nameRaw = (file as File & { name?: string }).name ?? "upload";
    const mime = file.type || null;
    const reject = contactDocumentRejectReason({ name: nameRaw, type: mime, size: file.size });
    if (reject) {
      return NextResponse.json({ error: reject }, { status: 400 });
    }
    if (file.size > CONTACT_DOC_MAX_BYTES) {
      return NextResponse.json({ error: "Το αρχείο υπερβαίνει το όριο 10MB" }, { status: 400 });
    }

    const safe = nameRaw.replace(/[^\w.\- ()\u0370-\u03FF\u1F00-\u1FFF]+/g, "_");
    const path = `crm/${user.id}/${Date.now()}-${safe}`;

    const admin = createServiceClient();
    const { error: upErr } = await admin.storage.from("documents").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });
    if (upErr) {
      console.error("[contacts/documents upload storage]", upErr);
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    const { data: ins, error: dErr } = await admin
      .from("documents")
      .insert({
        contact_id: contactId,
        request_id: null,
        name: safe,
        file_url: path,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: user.id,
      } as never)
      .select("id, name, file_url, file_type, file_size, created_at, contact_id, request_id, uploaded_by")
      .single();
    if (dErr) {
      await admin.storage.from("documents").remove([path]);
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }

    let signed_url: string | null = null;
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(path, 3600);
    signed_url = signed?.signedUrl ?? null;

    return NextResponse.json({ document: { ...ins, signed_url } });
  } catch (e) {
    console.error("[api/contacts/documents POST]", e);
    return nextJsonError();
  }
}
