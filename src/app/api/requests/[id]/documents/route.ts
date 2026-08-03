import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden, type UserProfile } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
import {
  CONTACT_DOC_MAX_BYTES,
  contactDocumentRejectReason,
  documentsStorageObjectPath,
  sanitizeStorageFilename,
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

type RouteParams = { params: { id: string } | Promise<{ id: string }> };

async function resolveRequestId(context: RouteParams): Promise<string> {
  const p = await Promise.resolve(context.params);
  return typeof p?.id === "string" ? p.id : "";
}

/** Match request-page canManage: system roles or custom roles via roles.access_tier. */
async function assertDocumentsManager(profile: UserProfile | null | undefined) {
  if (hasMinRole(profile?.role, "manager", profile?.access_tier)) return null;
  const roleName = profile?.role;
  if (!roleName) return forbidden();
  try {
    const admin = createServiceClient();
    const { data: tierRow } = await admin
      .from("roles")
      .select("access_tier")
      .eq("name", roleName)
      .maybeSingle();
    const tier = (tierRow as { access_tier?: string } | null)?.access_tier;
    if (hasMinRole(roleName, "manager", tier)) return null;
  } catch (e) {
    console.warn("[api/requests/documents] access_tier lookup failed", e);
  }
  return forbidden();
}

async function documentsForRequest(requestId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("documents")
    .select("id, contact_id, request_id, name, file_url, file_type, file_size, created_at, uploaded_by")
    .eq("request_id", requestId)
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

  // Service role only — avoids slow/failed user-session signed URLs that can abort the client fetch.
  const documents = await Promise.all(
    rows.map(async (r) => {
      let signedUrl: string | null = null;
      const objectPath = documentsStorageObjectPath(r.file_url);
      if (objectPath) {
        const { data: s } = await admin.storage.from("documents").createSignedUrl(objectPath, 3600);
        signedUrl = s?.signedUrl ?? null;
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

export async function GET(_request: NextRequest, context: RouteParams) {
  try {
    const requestId = await resolveRequestId(context);
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const denied = await assertDocumentsManager(crm.profile);
    if (denied) return denied;

    if (!requestId) {
      return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
    }

    const result = await documentsForRequest(requestId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ documents: result.documents });
  } catch (e) {
    console.error("[api/requests/documents GET]", e);
    return nextJsonError();
  }
}

/** Upload a document scoped to this request (`request_id` always set; `file_url` = storage object path). */
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const requestId = await resolveRequestId(context);
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user } = crm;
    const denied = await assertDocumentsManager(crm.profile);
    if (denied) return denied;

    if (!requestId) {
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

    const storageName = sanitizeStorageFilename(nameRaw);
    const path = `crm/${user.id}/${Date.now()}-${storageName}`;

    const admin = createServiceClient();
    const { error: upErr } = await admin.storage.from("documents").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });
    if (upErr) {
      console.error("[requests/documents upload storage]", upErr);
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    const { data: ins, error: dErr } = await admin
      .from("documents")
      .insert({
        contact_id: null,
        request_id: requestId,
        name: nameRaw,
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
    console.error("[api/requests/documents POST]", e);
    return nextJsonError();
  }
}
