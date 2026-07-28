import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { API_RACE_MS, runWithTimeCap } from "@/lib/api-resilience";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { getRequestStatusQueryValues, REQUEST_STATUS_OPEN } from "@/lib/request-statuses";
import { createTtlCache } from "@/lib/ttl-cache";
import {
  createServerTiming,
  logFetchTimings,
  timedFetch,
  withServerTimingHeaders,
} from "@/lib/server-timing";

export const dynamic = "force-dynamic";

const DASHBOARD_CACHE_TTL_MS = 60_000;

type DashboardPayload = {
  totalContacts: number;
  totalCallsToday: number;
  positiveRate: number;
  pendingContacts: number;
  notCalled30Count: number;
  overdueRequestCount: number;
  contactsWithoutPhoneCount: number;
  supporterCount: number;
  totalSupportAmount: number;
  recentActivity: Array<{ id: string; type: string; text: string; created_at: string }>;
};

const empty: DashboardPayload = {
  totalContacts: 0,
  totalCallsToday: 0,
  positiveRate: 0,
  pendingContacts: 0,
  notCalled30Count: 0,
  overdueRequestCount: 0,
  contactsWithoutPhoneCount: 0,
  supporterCount: 0,
  totalSupportAmount: 0,
  recentActivity: [],
};

const dashboardCountsCache = createTtlCache<DashboardPayload>(DASHBOARD_CACHE_TTL_MS);

export async function GET() {
  const timing = createServerTiming();
  try {
    const crm = await timing.time("auth", () => checkCRMAccess());
    if (!crm.allowed) return withServerTimingHeaders(crm.response, timing);
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return withServerTimingHeaders(forbidden(), timing);
    }

    const cached = dashboardCountsCache.get();
    if (cached.hit) {
      timing.mark("cache", 0, `hit age=${cached.ageMs}ms`);
      console.log(`[api/dashboard] counts cache HIT age=${cached.ageMs}ms`);
      return withServerTimingHeaders(NextResponse.json(cached.value), timing);
    }

    return await runWithTimeCap(
      API_RACE_MS,
      async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString();

        const cut30 = new Date(today);
        cut30.setDate(cut30.getDate() - 30);
        const cutIso = cut30.toISOString();
        const y = today.getFullYear();
        const mo = String(today.getMonth() + 1).padStart(2, "0");
        const da = String(today.getDate()).padStart(2, "0");
        const todayYmd = `${y}-${mo}-${da}`;

        const queriesStarted = Date.now();
        const [
          tTotalContacts,
          tCallsToday,
          tCallsPositive,
          tCallsTotal,
          tPending,
          tRecentCalls,
          tNotCalled30,
          tOverdue,
          tPhoneNull,
          tPhoneEmpty,
          tSupporters,
          tAmounts,
        ] = await Promise.all([
          timedFetch(
            "total_contacts",
            supabase.from("contacts").select("*", { count: "exact", head: true }),
          ),
          timedFetch(
            "calls_today",
            supabase.from("calls").select("*", { count: "exact", head: true }).gte("called_at", todayIso),
          ),
          timedFetch(
            "calls_positive_count",
            supabase.from("calls").select("id", { count: "exact", head: true }).eq("outcome", "Positive"),
          ),
          timedFetch(
            "calls_total_count",
            supabase.from("calls").select("id", { count: "exact", head: true }),
          ),
          timedFetch(
            "pending_contacts",
            supabase.from("contacts").select("*", { count: "exact", head: true }).eq("call_status", "Pending"),
          ),
          timedFetch(
            "recent_calls",
            supabase
              .from("calls")
              .select("id, called_at, outcome, contacts(first_name,last_name)")
              .order("called_at", { ascending: false })
              .limit(8),
          ),
          timedFetch(
            "not_called_30",
            supabase
              .from("contacts")
              .select("id", { count: "exact", head: true })
              .or(`last_contacted_at.is.null,last_contacted_at.lt."${cutIso}"`),
          ),
          timedFetch(
            "overdue_requests",
            supabase
              .from("requests")
              .select("id", { count: "exact", head: true })
              .in("status", getRequestStatusQueryValues(REQUEST_STATUS_OPEN))
              .lt("sla_due_date", todayYmd),
          ),
          timedFetch(
            "contacts_phone_null",
            supabase.from("contacts").select("id", { count: "exact", head: true }).is("phone", null),
          ),
          timedFetch(
            "contacts_phone_empty",
            supabase.from("contacts").select("id", { count: "exact", head: true }).eq("phone", ""),
          ),
          timedFetch(
            "supporter_count",
            supabase.from("supporters").select("id", { count: "exact", head: true }),
          ),
          timedFetch("supporter_amounts", supabase.from("supporters").select("amount")),
        ]);
        const timed = [
          tTotalContacts,
          tCallsToday,
          tCallsPositive,
          tCallsTotal,
          tPending,
          tRecentCalls,
          tNotCalled30,
          tOverdue,
          tPhoneNull,
          tPhoneEmpty,
          tSupporters,
          tAmounts,
        ];
        logFetchTimings("dashboard", timed);
        timing.mark("queries", Date.now() - queriesStarted, `${timed.length} parallel aggregates`);

        const c1 = tTotalContacts.value;
        const c2 = tCallsToday.value;
        const cPositive = tCallsPositive.value;
        const cTotalCalls = tCallsTotal.value;
        const c4 = tPending.value;
        const c5 = tRecentCalls.value;
        const c6 = tNotCalled30.value;
        const c7 = tOverdue.value;
        const c7b = tPhoneNull.value;
        const c7c = tPhoneEmpty.value;
        const c8 = tSupporters.value;
        const c9 = tAmounts.value;

        if (
          c1.error ||
          c2.error ||
          cPositive.error ||
          cTotalCalls.error ||
          c4.error ||
          c5.error ||
          c6.error ||
          c7.error ||
          c7b.error ||
          c7c.error ||
          c8.error ||
          c9.error
        ) {
          return withServerTimingHeaders(NextResponse.json(empty), timing);
        }

        const totalContacts = c1.count ?? 0;
        const totalCallsToday = c2.count ?? 0;
        const pendingContacts = c4.count ?? 0;
        const recentCalls = c5.data;

        const positive = cPositive.count ?? 0;
        const total = cTotalCalls.count ?? 0;
        const positiveRate = total > 0 ? (positive / total) * 100 : 0;

        const recentActivity = (recentCalls ?? []).map((c) => {
          const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
          return {
            id: c.id,
            type: "call",
            text: `${contact?.first_name ?? ""} ${contact?.last_name ?? ""} - ${c.outcome ?? "-"}`,
            created_at: c.called_at ?? new Date().toISOString(),
          };
        });

        const supportRows = (c9.data ?? []) as Array<{ amount: number | null }>;
        const totalSupportAmount = supportRows.reduce(
          (a, r) => a + (r.amount != null ? Number(r.amount) : 0),
          0,
        );

        const noPhone = (c7b.count ?? 0) + (c7c.count ?? 0);

        const payload: DashboardPayload = {
          totalContacts,
          totalCallsToday,
          positiveRate,
          pendingContacts,
          notCalled30Count: c6.count ?? 0,
          overdueRequestCount: c7.count ?? 0,
          contactsWithoutPhoneCount: noPhone,
          supporterCount: c8.count ?? 0,
          totalSupportAmount,
          recentActivity,
        };

        dashboardCountsCache.set(payload);
        console.log("[api/dashboard] counts cache MISS — stored 60s TTL");
        timing.mark("cache", 0, "miss stored");

        return withServerTimingHeaders(NextResponse.json(payload), timing);
      },
      withServerTimingHeaders(NextResponse.json(empty), timing),
    );
  } catch (e) {
    console.error("[api/dashboard]", e);
    return withServerTimingHeaders(NextResponse.json(empty), timing);
  }
}
