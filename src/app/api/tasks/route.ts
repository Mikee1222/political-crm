import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { defaultAnchorYmd, weekRangeYmd, type TaskTabFilter } from "@/lib/task-filters";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

const taskSelect = [
  "id",
  "contact_id",
  "title",
  "description",
  "due_date",
  "completed",
  "completed_at",
  "created_at",
  "priority",
  "category",
  "contacts(id, first_name, last_name, phone)",
].join(", ");

type Row = Record<string, unknown>;

function mapRow(row: Row) {
  const c = (row as { contacts: unknown }).contacts;
  const contact = Array.isArray(c) ? c[0] : c;
  return { ...row, contacts: contact ?? null } as object;
}

export async function GET(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const f = (request.nextUrl.searchParams.get("filter") as TaskTabFilter) || "all";
  const anchor = request.nextUrl.searchParams.get("date") || defaultAnchorYmd();
  const w = weekRangeYmd(anchor);
  if (!["all", "today", "week", "overdue"].includes(f)) {
    return NextResponse.json({ error: "Άκυρο filter" }, { status: 400 });
  }

  // —— Pending
  let pend = supabase.from("tasks").select(taskSelect).eq("completed", false);
  if (f === "today") {
    pend = pend.eq("due_date", anchor);
  } else if (f === "week") {
    pend = pend
      .gte("due_date", w.from)
      .lte("due_date", w.to)
      .not("due_date", "is", null);
  } else if (f === "overdue") {
    pend = pend
      .lt("due_date", anchor)
      .not("due_date", "is", null);
  }
  pend = pend.order("due_date", { ascending: true, nullsFirst: false });
  const { data: pRows, error: pErr } = await pend;
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  const { data: cRows, error: cErr } = await supabase
    .from("tasks")
    .select(taskSelect)
    .eq("completed", true)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(600);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

  const pList = (pRows ?? []).map((r) => mapRow(r as unknown as Row));
  let cList = (cRows ?? []).map((r) => mapRow(r as unknown as Row)) as object[];

  const dAnchor = (t: { completed_at?: string | null; created_at?: string | null }) =>
    (t.completed_at || t.created_at || "").slice(0, 10) || null;

  if (f === "today") {
    cList = cList.filter((t) => dAnchor(t as { completed_at?: string | null; created_at?: string | null }) === anchor);
  } else if (f === "week") {
    cList = cList.filter((t) => {
      const d = dAnchor(t as { completed_at?: string | null; created_at?: string | null });
      return d != null && d >= w.from && d <= w.to;
    });
  } else if (f === "overdue") {
    cList = cList.slice(0, 30);
  }

  return NextResponse.json({
    pending: pList,
    completed: cList,
    anchor,
  });
  } catch (e) {
    console.error("[api/tasks GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: Request) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }
  const body = (await request.json()) as {
    contact_id: string;
    title: string;
    due_date?: string | null;
    description?: string | null;
    priority?: string;
    category?: string | null;
  };
  if (!body.contact_id || !body.title?.trim()) {
    return NextResponse.json({ error: "Υποχρεωτικά: επαφή, τίτλος" }, { status: 400 });
  }
  const pr = String(body.priority ?? "Medium");
  if (!["High", "Medium", "Low"].includes(pr)) {
    return NextResponse.json({ error: "Άκυρη προτεραιότητα" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      contact_id: body.contact_id,
      title: body.title.trim(),
      due_date: body.due_date || null,
      description: body.description?.trim() || null,
      completed: false,
      priority: pr,
      category: body.category || null,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ task: data });
  } catch (e) {
    console.error("[api/tasks POST]", e);
    return nextJsonError();
  }
}
