import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const optSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const createSchema = z.object({
  title: z.string().min(1),
  question: z.string().min(1),
  options: z.array(optSchema).min(2),
  target_group_id: z.string().uuid().optional().nullable(),
  ends_at: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const { data, error } = await supabase
      .from("polls")
      .select("id, title, question, options, status, target_group_id, created_at, ends_at")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const ids = (data ?? []).map((r) => (r as { id: string }).id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: resRows } = await supabase
        .from("poll_responses")
        .select("poll_id")
        .in("poll_id", ids);
      for (const r of resRows ?? []) {
        const pid = (r as { poll_id: string }).poll_id;
        counts[pid] = (counts[pid] ?? 0) + 1;
      }
    }
    const polls = (data ?? []).map((p) => ({
      ...p,
      response_count: counts[(p as { id: string }).id] ?? 0,
    }));
    return NextResponse.json({ polls });
  } catch (e) {
    console.error("[api/polls GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const b = parsed.data;
    const { data, error } = await supabase
      .from("polls")
      .insert({
        title: b.title,
        question: b.question,
        options: b.options,
        status: "active",
        target_group_id: b.target_group_id ?? null,
        ends_at: b.ends_at ?? null,
        created_by: user.id,
      } as never)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ poll: data });
  } catch (e) {
    console.error("[api/polls POST]", e);
    return nextJsonError();
  }
}
