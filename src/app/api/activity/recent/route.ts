import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { activityGreekLine, firstNameFromFull, formatTimeAgo } from "@/lib/activity-descriptions";
import type { ActivityAction } from "@/lib/activity-log";

export async function GET() {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();

  const admin = createServiceClient();
  const { data: rows, error } = await admin
    .from("activity_log")
    .select("id, user_id, action, entity_type, entity_id, entity_name, details, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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

  const activities = list.map((r) => {
    const fullName = r.user_id ? (pmap.get(r.user_id) ?? null) : null;
    const first = firstNameFromFull(
      (r.details as { system?: boolean; actor_name?: string } | null)?.actor_name
        ? String((r.details as { actor_name?: string }).actor_name)
        : fullName,
    );
    const action = r.action as ActivityAction;
    const name = r.entity_name ?? "—";
    const text = activityGreekLine({ action, actorFirstName: first, entityName: name });
    const timeAgo = formatTimeAgo(r.created_at);
    const initials = fullName
      ? fullName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0] ?? "")
          .join("")
          .toUpperCase() || "Κ"
      : "•";
    return {
      id: r.id,
      text,
      timeAgo,
      created_at: r.created_at,
      user_id: r.user_id,
      avatar: initials || "ΚΚ",
    };
  });

  return NextResponse.json({ activities });
}
