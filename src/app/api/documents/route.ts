import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

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

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const contactId = request.nextUrl.searchParams.get("contact_id");
    const requestId = request.nextUrl.searchParams.get("request_id");

    const admin = createServiceClient();
    let q = admin.from("documents").select("id, contact_id, request_id, name, file_url, file_type, file_size, created_at, uploaded_by").order("created_at", { ascending: false });

    if (contactId) {
      q = q.eq("contact_id", contactId);
    } else if (requestId) {
      q = q.eq("request_id", requestId);
    } else {
      q = q.is("contact_id", null).is("request_id", null).limit(500);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
        const { data: s } = await sc.storage.from("documents").createSignedUrl(r.file_url, 3600);
        signedUrl = s?.signedUrl ?? null;
        if (!signedUrl) {
          const { data: s2 } = await admin.storage.from("documents").createSignedUrl(r.file_url, 3600);
          signedUrl = s2?.signedUrl ?? null;
        }
        return {
          ...r,
          uploader_name: r.uploaded_by ? nameById.get(r.uploaded_by) ?? null : null,
          signed_url: signedUrl,
        };
      }),
    );
    return NextResponse.json({ documents });
  } catch (e) {
    console.error("[api/documents GET]", e);
    return nextJsonError();
  }
}
