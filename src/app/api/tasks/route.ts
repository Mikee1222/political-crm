import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { defaultAnchorYmd, weekRangeYmd, type TaskTabFilter } from "@/lib/task-filters";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

const taskSelect = [
  "id",
  "contact_id",
  "assigned_to_user_id",
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

function mapRow(row: Row, assigneeMap: Map<string, { id: string; full_name: string | null }>) {
  const c = (row as { contacts: unknown }).contacts;
  const contact = Array.isArray(c) ? c[0] : c;
  const aid = row.assigned_to_user_id as string | null | undefined;
  const assignee = aid ? assigneeMap.get(aid) ?? null : null;
  return { ...row, contacts: contact ?? null, assignee } as object;
}

async function assigneeMapForRows(supabase: SupabaseClient, rows: Row[]) {
  const ids = [...new Set(rows.map((r) => r.assigned_to_user_id).filter(Boolean))] as string[];
  const map = new Map<string, { id: string; full_name: string | null }>();
  if (!ids.length) return map;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  for (const p of (data ?? []) as { id: string; full_name: string | null }[]) {
    map.set(p.id, p);
  }
  return map;
}

export async function GET(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
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

  const rawAll = [...(pRows ?? []), ...(cRows ?? [])] as unknown as Row[];
  const assigneeMap = await assigneeMapForRows(supabase, rawAll);
  const pList = (pRows ?? []).map((r) => mapRow(r as unknown as Row, assigneeMap));
  let cList = (cRows ?? []).map((r) => mapRow(r as unknown as Row, assigneeMap)) as object[];

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
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
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
    assigned_to_user_id?: string | null;
  };
  if (!body.contact_id || !body.title?.trim()) {
    return NextResponse.json({ error: "Υποχρεωτικά: επαφή, τίτλος" }, { status: 400 });
  }
  const pr = String(body.priority ?? "Medium");
  if (!["High", "Medium", "Low"].includes(pr)) {
    return NextResponse.json({ error: "Άκυρη προτεραιότητα" }, { status: 400 });
  }
  let assignId: string | null = null;
  if (body.assigned_to_user_id != null && body.assigned_to_user_id !== "") {
    const { data: prof, error: pe } = await supabase.from("profiles").select("id").eq("id", body.assigned_to_user_id).maybeSingle();
    if (pe || !prof) {
      return NextResponse.json({ error: "Άκυρος υπεύθυνος χρήστης" }, { status: 400 });
    }
    assignId = body.assigned_to_user_id;
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
      assigned_to_user_id: assignId,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  let assignee: { id: string; full_name: string | null } | null = null;
  if (assignId) {
    const { data: pr } = await supabase.from("profiles").select("id, full_name").eq("id", assignId).maybeSingle();
    if (pr) assignee = pr as { id: string; full_name: string | null };
  }
  return NextResponse.json({ task: { ...(data as object), assignee } });
  } catch (e) {
    console.error("[api/tasks POST]", e);
    return nextJsonError();
  }
}
