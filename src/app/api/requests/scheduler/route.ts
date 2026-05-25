import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRequestStatusQueryValues,
  normalizeRequestStatus,
  REQUEST_STATUS_OPEN,
} from "@/lib/request-statuses";

export const dynamic = "force-dynamic";

const QUEUE_STATUSES = getRequestStatusQueryValues(REQUEST_STATUS_OPEN);

const SELECT_WITH_CONTACT =
  "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, scheduled_date, contact_id, contacts!contact_id(first_name,last_name)";

const SELECT_FALLBACK =
  "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, scheduled_date, contact_id";

function escapeIlike(q: string) {
  return q.replace(/[%_\\,().]/g, (c) => `\\${c}`);
}

type SchedulerFilters = {
  q: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string;
  contactIdsFromPhone: string[];
};

function mapRow(row: unknown) {
  const r0 = row as { contacts?: unknown; status?: string | null };
  const c = r0.contacts;
  const contact = Array.isArray(c) ? c[0] : c;
  return {
    ...(row as Record<string, unknown>),
    status: normalizeRequestStatus(r0.status ?? null),
    contacts: contact ?? null,
  };
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

async function resolvePhoneContactIds(supabase: SupabaseClient, q: string): Promise<string[]> {
  const raw = q.trim();
  if (!raw || !/^\d+/.test(raw)) return [];
  const pat = `%${escapeIlike(raw)}%`;
  const { data: phoneMatches } = await supabase
    .from("contacts")
    .select("id")
    .or(`phone.ilike.${pat},phone2.ilike.${pat},landline.ilike.${pat}`);
  return (phoneMatches ?? []).map((c) => (c as { id: string }).id);
}

function filtersFromParams(
  sp: URLSearchParams,
  prefix: string,
  contactIdsFromPhone: string[],
): SchedulerFilters {
  return {
    q: sp.get(`${prefix}q`)?.trim() ?? "",
    category: sp.get(`${prefix}category`)?.trim() ?? "",
    priority: sp.get(`${prefix}priority`)?.trim() ?? "",
    status: sp.get(`${prefix}status`)?.trim() ?? "",
    assigned_to: sp.get(`${prefix}assigned_to`)?.trim() ?? "",
    contactIdsFromPhone,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySchedulerFilters(query: any, f: SchedulerFilters) {
  if (f.category) query = query.eq("category", f.category);
  if (f.priority) query = query.eq("priority", f.priority);
  if (f.status) {
    const statusValues = getRequestStatusQueryValues(f.status);
    query = statusValues.length > 1 ? query.in("status", statusValues) : query.eq("status", statusValues[0]);
  }
  if (f.assigned_to) query = query.eq("assigned_to", f.assigned_to);
  if (f.q) {
    const pat = `%${escapeIlike(f.q)}%`;
    const parts = [`title.ilike.${pat}`];
    if (f.contactIdsFromPhone.length > 0) {
      parts.push(`contact_id.in.(${f.contactIdsFromPhone.join(",")})`);
    }
    query = query.or(parts.join(","));
  }
  return query;
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

    const sp = request.nextUrl.searchParams;
    const { weekStart, weekEnd } = rangeBounds(sp);
    const queueQ = sp.get("queue_q")?.trim() ?? "";
    const scheduledQ = sp.get("q")?.trim() ?? "";
    const queuePhoneIds = queueQ ? await resolvePhoneContactIds(supabase, queueQ) : [];
    const scheduledPhoneIds = scheduledQ ? await resolvePhoneContactIds(supabase, scheduledQ) : [];
    const queueFilters = filtersFromParams(sp, "queue_", queuePhoneIds);
    const scheduledFilters = filtersFromParams(sp, "", scheduledPhoneIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queueQuery: any = supabase
      .from("requests")
      .select(SELECT_WITH_CONTACT)
      .is("scheduled_date", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!queueFilters.status) {
      queueQuery = queueQuery.in("status", [...QUEUE_STATUSES]);
    }
    queueQuery = applySchedulerFilters(queueQuery, queueFilters);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scheduledQuery: any = supabase
      .from("requests")
      .select(SELECT_WITH_CONTACT)
      .gte("scheduled_date", weekStart)
      .lte("scheduled_date", weekEnd)
      .order("scheduled_date", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    scheduledQuery = applySchedulerFilters(scheduledQuery, scheduledFilters);

    let [queueRes, scheduledRes] = await Promise.all([queueQuery, scheduledQuery]);

    const missingCol = (msg: string) =>
      msg.includes("scheduled_date") || (msg.includes("column") && msg.includes("scheduled"));

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let queueFallback: any = supabase
        .from("requests")
        .select(SELECT_FALLBACK)
        .is("scheduled_date", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!queueFilters.status) {
        queueFallback = queueFallback.in("status", [...QUEUE_STATUSES]);
      }
      queueFallback = applySchedulerFilters(queueFallback, queueFilters);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let scheduledFallback: any = supabase
        .from("requests")
        .select(SELECT_FALLBACK)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd)
        .order("scheduled_date", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(500);
      scheduledFallback = applySchedulerFilters(scheduledFallback, scheduledFilters);

      [queueRes, scheduledRes] = await Promise.all([queueFallback, scheduledFallback]);
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
