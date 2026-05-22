import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { addDays, format, parseISO, startOfWeek } from "date-fns";

export const dynamic = "force-dynamic";

const QUEUE_STATUSES = ["Νέο", "Σε εξέλιξη"] as const;

const SELECT_WITH_CONTACT =
  "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, scheduled_date, contact_id, contacts!contact_id(first_name,last_name)";

const SELECT_FALLBACK =
  "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, scheduled_date, contact_id";

function mapRow(row: unknown) {
  const r0 = row as { contacts?: unknown };
  const c = r0.contacts;
  const contact = Array.isArray(c) ? c[0] : c;
  return { ...(row as Record<string, unknown>), contacts: contact ?? null };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function weekBounds(weekParam: string | null) {
  const base = weekParam && DATE_RE.test(weekParam) ? parseISO(weekParam) : new Date();
  const start = startOfWeek(base, { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return {
    weekStart: format(start, "yyyy-MM-dd"),
    weekEnd: format(end, "yyyy-MM-dd"),
  };
}

function rangeBounds(sp: URLSearchParams) {
  const ws = sp.get("week_start")?.trim() ?? "";
  const we = sp.get("week_end")?.trim() ?? "";
  if (DATE_RE.test(ws) && DATE_RE.test(we) && ws <= we) {
    return { weekStart: ws, weekEnd: we };
  }
  return weekBounds(sp.get("week"));
}

/** GET ?week=YYYY-MM-DD or ?week_start=&week_end= → { queue, scheduled, weekStart, weekEnd } */
export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const { weekStart, weekEnd } = rangeBounds(request.nextUrl.searchParams);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queueQuery: any = supabase
      .from("requests")
      .select(SELECT_WITH_CONTACT)
      .is("scheduled_date", null)
      .in("status", [...QUEUE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scheduledQuery: any = supabase
      .from("requests")
      .select(SELECT_WITH_CONTACT)
      .gte("scheduled_date", weekStart)
      .lte("scheduled_date", weekEnd)
      .order("scheduled_date", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    let [queueRes, scheduledRes] = await Promise.all([queueQuery, scheduledQuery]);

    const missingCol = (msg: string) =>
      msg.includes("scheduled_date") || msg.includes("column") && msg.includes("scheduled");

    if (queueRes.error && missingCol(queueRes.error.message)) {
      return NextResponse.json(
        {
          error:
            "Η στήλη scheduled_date δεν υπάρχει ακόμα. Εκτελέστε το migration 20260522_requests_scheduled_date.sql στο Supabase.",
        },
        { status: 400 },
      );
    }

    if (
      (queueRes.error && queueRes.error.message.includes("contacts")) ||
      (scheduledRes.error && scheduledRes.error.message.includes("contacts"))
    ) {
      queueQuery = supabase
        .from("requests")
        .select(SELECT_FALLBACK)
        .is("scheduled_date", null)
        .in("status", [...QUEUE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(200);
      scheduledQuery = supabase
        .from("requests")
        .select(SELECT_FALLBACK)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd)
        .order("scheduled_date", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(500);
      [queueRes, scheduledRes] = await Promise.all([queueQuery, scheduledQuery]);
    }

    if (queueRes.error) {
      return NextResponse.json({ error: queueRes.error.message }, { status: 400 });
    }
    if (scheduledRes.error) {
      return NextResponse.json({ error: scheduledRes.error.message }, { status: 400 });
    }

    return NextResponse.json({
      queue: (queueRes.data ?? []).map(mapRow),
      scheduled: (scheduledRes.data ?? []).map(mapRow),
      weekStart,
      weekEnd,
    });
  } catch (e) {
    console.error("[api/requests/scheduler GET]", e);
    return nextJsonError();
  }
}
