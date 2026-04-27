import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, profile } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const admin = createServiceClient();
    const { data: row, error: fe } = await admin.from("documents").select("id, file_url").eq("id", id).maybeSingle();
    if (fe || !row) {
      return NextResponse.json({ error: "Άκυρο έγγραφο" }, { status: 404 });
    }
    const path = (row as { file_url: string }).file_url;
    if (path) {
      const { error: re } = await admin.storage.from("documents").remove([path]);
      if (re) {
        console.error("[documents delete storage]", re.message);
      }
    }
    const { error: de } = await admin.from("documents").delete().eq("id", id);
    if (de) {
      return NextResponse.json({ error: de.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/documents DELETE]", e);
    return nextJsonError();
  }
}
