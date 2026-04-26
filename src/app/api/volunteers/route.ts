import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const area = request.nextUrl.searchParams.get("volunteer_area");
    let q = supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, volunteer_role, volunteer_area, volunteer_since, is_volunteer")
      .eq("is_volunteer", true)
      .order("last_name", { ascending: true });
    if (area) {
      q = q.ilike("volunteer_area", `%${area}%`);
    }
    const { data: contacts, error: e1 } = await q;
    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 400 });
    }
    const ids = (contacts ?? []).map((c) => (c as { id: string }).id);
    const taskCounts: Record<string, number> = {};
    if (ids.length) {
      const { data: tasks } = await supabase.from("tasks").select("contact_id").in("contact_id", ids);
      for (const t of tasks ?? []) {
        const r = t as { contact_id: string };
        taskCounts[r.contact_id] = (taskCounts[r.contact_id] ?? 0) + 1;
      }
    }
    return NextResponse.json({
      volunteers: (contacts ?? []).map((c) => ({
        ...(c as object),
        task_count: taskCounts[(c as { id: string }).id] ?? 0,
      })),
    });
  } catch (e) {
    console.error("[api/volunteers GET]", e);
    return nextJsonError();
  }
}
