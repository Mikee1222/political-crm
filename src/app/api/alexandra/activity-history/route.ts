import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { activityGreekLine, firstNameFromFull, formatTimeAgo } from "@/lib/activity-descriptions";
import type { ActivityAction } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const ENTITY_HREF: Record<string, (id: string) => string | null> = {
  contact: (id) => `/contacts/${id}`,
  campaign: (id) => `/campaigns/${id}`,
  request: () => `/requests`,
  task: () => `/tasks`,
};

function hrefFor(r: { entity_type: string; entity_id: string | null }): string | null {
  if (!r.entity_id) return null;
  const t = (r.entity_type || "").toLowerCase();
  const h = ENTITY_HREF[t];
  if (h) return h(r.entity_id);
  return null;
}

export async function GET(request: NextRequest) {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();

  const action = request.nextUrl.searchParams.get("action");
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50) || 50));

  const admin = createServiceClient();
  let q = admin
    .from("activity_log")
    .select("id, user_id, action, entity_type, entity_id, entity_name, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (action && action.trim()) {
    q = q.eq("action", action.trim());
  }
  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{
    id: string;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    entity_name: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  }>;

  const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
  const { data: profs } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null }[] };
  const pmap = new Map((profs ?? []).map((p) => [p.id, p.full_name] as [string, string | null]));

  const items = list.map((r) => {
    const fullName = r.user_id ? (pmap.get(r.user_id) ?? null) : null;
    const first = firstNameFromFull(
      (r.details as { actor_name?: string } | null)?.actor_name
        ? String((r.details as { actor_name?: string }).actor_name)
        : fullName,
    );
    const act = r.action as ActivityAction;
    const name = r.entity_name ?? "—";
    const text = activityGreekLine({ action: act, actorFirstName: first, entityName: name });
    const timeAgo = formatTimeAgo(r.created_at);
    return {
      id: r.id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      description: text,
      timeAgo,
      created_at: r.created_at,
      href: hrefFor(r),
    };
  });

  return NextResponse.json({ items, actions: ["contact_created", "contact_updated", "call_made", "request_created", "request_updated", "campaign_started"] });
}
