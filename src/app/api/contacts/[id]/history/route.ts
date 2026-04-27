import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveProfileNames } from "@/lib/profile-names";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const contactId = params.id;
    const admin = createServiceClient();
    const { data: reqRows } = await admin.from("requests").select("id").eq("contact_id", contactId);
    const { data: taskRows } = await admin.from("tasks").select("id").eq("contact_id", contactId);
    const rids = (reqRows ?? []).map((r) => (r as { id: string }).id);
    const tids = (taskRows ?? []).map((r) => (r as { id: string }).id);
    const [a1, a2, a3] = await Promise.all([
      supabase
        .from("activity_log")
        .select("id, user_id, action, entity_type, entity_id, entity_name, details, created_at")
        .eq("entity_type", "contact")
        .eq("entity_id", contactId)
        .order("created_at", { ascending: false })
        .limit(200),
      rids.length
        ? supabase
            .from("activity_log")
            .select("id, user_id, action, entity_type, entity_id, entity_name, details, created_at")
            .eq("entity_type", "request")
            .in("entity_id", rids)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null as null }),
      tids.length
        ? supabase
            .from("activity_log")
            .select("id, user_id, action, entity_type, entity_id, entity_name, details, created_at")
            .eq("entity_type", "task")
            .in("entity_id", tids)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null as null }),
    ]);
    const err = a1.error || a2.error || a3.error;
    if (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const rows = [
      ...((a1.data ?? []) as object[]),
      ...((a2.data ?? []) as object[]),
      ...((a3.data ?? []) as object[]),
    ]
      .sort(
        (x, y) =>
          new Date((y as { created_at: string }).created_at).getTime() -
          new Date((x as { created_at: string }).created_at).getTime(),
      )
      .slice(0, 200);
    const uids = [...new Set((rows ?? []).map((r) => (r as { user_id: string | null }).user_id).filter(Boolean))] as string[];
    const names = await resolveProfileNames(uids);
    const withNames = (rows ?? []).map((r) => {
      const u = (r as { user_id: string | null }).user_id;
      return {
        ...r,
        user_name: u ? (names.get(u) ?? "—") : "—",
      };
    });
    return NextResponse.json({ entries: withNames });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
