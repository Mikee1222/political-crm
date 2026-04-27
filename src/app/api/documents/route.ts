import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const contactId = request.nextUrl.searchParams.get("contact_id");
    const requestId = request.nextUrl.searchParams.get("request_id");
    const sb = await createClient();
    let q = sb
      .from("documents")
      .select("id, contact_id, request_id, name, file_url, file_type, file_size, created_at, uploaded_by")
      .order("created_at", { ascending: false });
    if (contactId) {
      q = q.eq("contact_id", contactId);
    } else if (requestId) {
      q = q.eq("request_id", requestId);
    } else {
      return NextResponse.json({ error: "contact_id ή request_id" }, { status: 400 });
    }
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const rows = (data ?? []) as Array<{
      id: string;
      file_url: string;
      [k: string]: unknown;
    }>;
    const documents = await Promise.all(
      rows.map(async (r) => {
        const { data: s } = await sb.storage.from("documents").createSignedUrl(r.file_url, 3600);
        return { ...r, signed_url: s?.signedUrl ?? null };
      }),
    );
    return NextResponse.json({ documents });
  } catch (e) {
    console.error("[api/documents GET]", e);
    return nextJsonError();
  }
}
