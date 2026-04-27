import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const form = await request.formData();
    const file = form.get("file");
    const contactId = String(form.get("contact_id") ?? "").trim() || null;
    const requestId = String(form.get("request_id") ?? "").trim() || null;
    if (!(file instanceof Blob) || !file.size) {
      return NextResponse.json({ error: "Άκειρο αρχείο" }, { status: 400 });
    }
    if (!contactId && !requestId) {
      return NextResponse.json({ error: "Χρειάζεται contact_id ή request_id" }, { status: 400 });
    }

    const nameRaw = (file as File & { name?: string }).name ?? "upload";
    const safe = nameRaw.replace(/[^\w.\- ()\u0370-\u03FF\u1F00-\u1FFF]+/g, "_");
    const path = `crm/${user.id}/${Date.now()}-${safe}`;

    const sc = await createClient();
    const ab = await file.arrayBuffer();
    const { error: upErr } = await sc.storage.from("documents").upload(path, ab, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    const { data: ins, error: dErr } = await supabase
      .from("documents")
      .insert({
        contact_id: contactId,
        request_id: requestId,
        name: safe,
        file_url: path,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: user.id,
      } as never)
      .select("id, name, file_url, file_type, file_size, created_at, contact_id, request_id")
      .single();
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 400 });
    }

    return NextResponse.json({ document: ins });
  } catch (e) {
    console.error("[api/documents/upload]", e);
    return nextJsonError();
  }
}
