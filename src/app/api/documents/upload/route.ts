import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const form = await request.formData();
    const file = form.get("file");
    const contactId = String(form.get("contact_id") ?? "").trim() || null;
    const requestId = String(form.get("request_id") ?? "").trim() || null;
    const library = String(form.get("library") ?? "") === "1";

    if (!(file instanceof Blob) || !file.size) {
      return NextResponse.json({ error: "Άκυρο αρχείο" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Το αρχείο υπερβαίνει το όριο 50MB" }, { status: 400 });
    }
    if (!library && !contactId && !requestId) {
      return NextResponse.json({ error: "Χρειάζεται contact_id, request_id ή library=1" }, { status: 400 });
    }

    const nameRaw = (file as File & { name?: string }).name ?? "upload";
    const safe = nameRaw.replace(/[^\w.\- ()\u0370-\u03FF\u1F00-\u1FFF]+/g, "_");
    const path = `crm/${user.id}/${Date.now()}-${safe}`;

    const admin = createServiceClient();
    const { error: upErr } = await admin.storage.from("documents").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });
    if (upErr) {
      console.error("[documents upload storage]", upErr);
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    const { data: ins, error: dErr } = await admin
      .from("documents")
      .insert({
        contact_id: library ? null : contactId,
        request_id: library ? null : requestId,
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

    return NextResponse.json({ document: ins });
  } catch (e) {
    console.error("[api/documents/upload]", e);
    return nextJsonError();
  }
}
