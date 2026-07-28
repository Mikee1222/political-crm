import type { SupabaseClient } from "@supabase/supabase-js";
import { pad2, todayYmdAthens } from "@/lib/athens-ranges";
import { formatGreekContactName } from "@/lib/contact-display-name";
import { resolveNamedayNamesForDay } from "@/lib/namedays";
import { createTtlCache } from "@/lib/ttl-cache";
import { logFetchTimings, timedFetch } from "@/lib/server-timing";

export type DashboardContactRow = {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
};

export type DashboardRequestRow = {
  id: string;
  title: string;
  category: string | null;
  contactName: string;
  created_at: string | null;
};

export type NamedayDay = {
  label: "ΣΗΜΕΡΑ" | "ΑΥΡΙΟ" | "ΜΕΘΑΥΡΙΟ";
  dateLabel: string;
  month: number;
  day: number;
  names: string[];
};

export type GroupDistributionRow = {
  id: string;
  name: string;
  color: string | null;
  count: number;
};

export type DashboardWidgetsData = {
  namedays: NamedayDay[];
  recentInserts: DashboardContactRow[];
  recentUpdates: DashboardContactRow[];
  recentContactViews: DashboardContactRow[];
  recentRequestViews: Array<{
    id: string;
    requestId: string;
    title: string;
    contactName: string;
    viewed_at: string;
  }>;
  recentRequests: DashboardRequestRow[];
  groups: GroupDistributionRow[];
};

/** Shared (non-per-user) widget slices — 60s TTL. */
export type DashboardWidgetsShared = {
  namedays: NamedayDay[];
  recentInserts: DashboardContactRow[];
  recentUpdates: DashboardContactRow[];
  recentRequests: DashboardRequestRow[];
};

const SHARED_TTL_MS = 60_000;
const sharedWidgetsCache = createTtlCache<{ dayKey: string; data: DashboardWidgetsShared }>(SHARED_TTL_MS);
const groupsCache = createTtlCache<GroupDistributionRow[]>(SHARED_TTL_MS);

function ymdAddDays(ymd: string, days: number): string {
  const p = ymd.split("-").map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return ymd;
  const [Y, M, D] = p as [number, number, number];
  const d = new Date(Y, M - 1, D);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Short Athens calendar label e.g. 30/6/2026 */
export function formatNamedayDateLabel(ymd: string): string {
  const p = ymd.split("-").map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return ymd;
  const [Y, M, D] = p as [number, number, number];
  return `${D}/${M}/${Y}`;
}

function mapContactRow(c: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  father_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): DashboardContactRow {
  return {
    id: c.id,
    name: formatGreekContactName(c.last_name, c.first_name, c.father_name),
    created_at: c.created_at ?? null,
    updated_at: c.updated_at ?? null,
  };
}

async function fetchNamedaysForYmd(
  supabase: SupabaseClient,
  ymd: string,
  label: NamedayDay["label"],
): Promise<NamedayDay> {
  const p = ymd.split("-").map((x) => parseInt(x, 10));
  const month = p[1] ?? 1;
  const day = p[2] ?? 1;
  const { data } = await supabase.from("name_days").select("names").eq("month", month).eq("day", day);
  const dbNames: string[] = [];
  for (const row of data ?? []) {
    for (const n of (row as { names?: string[] }).names ?? []) {
      const t = String(n).trim();
      if (t) dbNames.push(t);
    }
  }
  return {
    label,
    dateLabel: formatNamedayDateLabel(ymd),
    month,
    day,
    names: resolveNamedayNamesForDay(dbNames, month, day),
  };
}

function mapRecentUpdates(
  rows: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    father_name?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }>,
): DashboardContactRow[] {
  return rows
    .filter((c) => {
      if (!c.updated_at || !c.created_at) return false;
      return c.updated_at !== c.created_at;
    })
    .slice(0, 5)
    .map((c) => mapContactRow(c));
}

function mapRecentRequests(
  rows: Array<{
    id: string;
    title: string | null;
    category: string | null;
    created_at: string | null;
    contacts:
      | { first_name: string | null; last_name: string | null; father_name?: string | null }
      | { first_name: string | null; last_name: string | null; father_name?: string | null }[]
      | null;
  }>,
): DashboardRequestRow[] {
  return rows.map((r) => {
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return {
      id: r.id,
      title: r.title ?? "—",
      category: r.category,
      contactName: contact
        ? formatGreekContactName(contact.last_name, contact.first_name, contact.father_name)
        : "—",
      created_at: r.created_at,
    };
  });
}

/** Shared namedays + recent inserts/updates/requests (safe to cache across users). */
export async function fetchDashboardWidgetsShared(
  supabase: SupabaseClient,
): Promise<DashboardWidgetsShared> {
  const today = todayYmdAthens();
  const cached = sharedWidgetsCache.get();
  if (cached.hit && cached.value.dayKey === today) {
    console.log(`[dashboard] shared_widgets cache HIT age=${cached.ageMs}ms`);
    return cached.value.data;
  }

  const tomorrow = ymdAddDays(today, 1);
  const dayAfter = ymdAddDays(today, 2);

  const [
    tNamedayToday,
    tNamedayTomorrow,
    tNamedayDayAfter,
    tInserts,
    tUpdates,
    tRequests,
  ] = await Promise.all([
    timedFetch("namedays_today", fetchNamedaysForYmd(supabase, today, "ΣΗΜΕΡΑ")),
    timedFetch("namedays_tomorrow", fetchNamedaysForYmd(supabase, tomorrow, "ΑΥΡΙΟ")),
    timedFetch("namedays_day_after", fetchNamedaysForYmd(supabase, dayAfter, "ΜΕΘΑΥΡΙΟ")),
    timedFetch(
      "recent_inserts",
      supabase
        .from("contacts")
        .select("id, first_name, last_name, father_name, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ),
    timedFetch(
      "recent_updates",
      supabase
        .from("contacts")
        .select("id, first_name, last_name, father_name, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(25),
    ),
    timedFetch(
      "recent_requests",
      supabase
        .from("requests")
        .select(
          "id, title, category, created_at, contacts!requests_contact_id_fkey ( first_name, last_name, father_name )",
        )
        .order("created_at", { ascending: false })
        .limit(5),
    ),
  ]);

  logFetchTimings("dashboard", [
    tNamedayToday,
    tNamedayTomorrow,
    tNamedayDayAfter,
    tInserts,
    tUpdates,
    tRequests,
  ]);

  const namedayToday = tNamedayToday.value;
  const namedayTomorrow = tNamedayTomorrow.value;
  const namedayDayAfter = tNamedayDayAfter.value;
  const insertsRes = tInserts.value;
  const updatesRes = tUpdates.value;
  const requestsRes = tRequests.value;

  type ContactSelect = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    father_name?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  type RequestSelect = {
    id: string;
    title: string | null;
    category: string | null;
    created_at: string | null;
    contacts:
      | { first_name: string | null; last_name: string | null; father_name?: string | null }
      | { first_name: string | null; last_name: string | null; father_name?: string | null }[]
      | null;
  };

  const data: DashboardWidgetsShared = {
    namedays: [namedayToday, namedayTomorrow, namedayDayAfter],
    recentInserts: ((insertsRes.data ?? []) as ContactSelect[]).map((c) => mapContactRow(c)),
    recentUpdates: mapRecentUpdates((updatesRes.data ?? []) as ContactSelect[]),
    recentRequests: mapRecentRequests((requestsRes.data ?? []) as RequestSelect[]),
  };

  sharedWidgetsCache.set({ dayKey: today, data });
  return data;
}

/** Per-user recently viewed — never cache across users. */
export async function fetchDashboardWidgetsUserViews(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  recentContactViews: DashboardContactRow[];
  recentRequestViews: DashboardWidgetsData["recentRequestViews"];
}> {
  const [tContactViews, tRequestViews] = await Promise.all([
    timedFetch(
      "recent_contact_views",
      supabase
        .from("contact_views")
        .select("contact_id, viewed_at, contacts!inner ( id, first_name, last_name, father_name )")
        .eq("user_id", userId)
        .order("viewed_at", { ascending: false })
        .limit(5),
    ),
    timedFetch(
      "recent_request_views",
      supabase
        .from("request_views")
        .select(
          "request_id, viewed_at, requests!inner ( id, title, contacts!requests_contact_id_fkey ( first_name, last_name, father_name ) )",
        )
        .eq("user_id", userId)
        .order("viewed_at", { ascending: false })
        .limit(5),
    ),
  ]);

  logFetchTimings("dashboard", [tContactViews, tRequestViews]);

  const contactViewsRes = tContactViews.value;
  const requestViewsRes = tRequestViews.value;

  const recentContactViews: DashboardContactRow[] = (contactViewsRes.data ?? []).map((row) => {
    const r = row as unknown as {
      contact_id: string;
      viewed_at: string;
      contacts:
        | { id: string; first_name: string | null; last_name: string | null; father_name?: string | null }
        | { id: string; first_name: string | null; last_name: string | null; father_name?: string | null }[];
    };
    const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return {
      id: c?.id ?? r.contact_id,
      name: formatGreekContactName(c?.last_name, c?.first_name, c?.father_name),
      created_at: null,
      updated_at: r.viewed_at,
    };
  });

  const recentRequestViews = (requestViewsRes.data ?? []).map((row) => {
    const r = row as unknown as {
      request_id: string;
      viewed_at: string;
      requests: {
        id: string;
        title: string | null;
        contacts:
          | { first_name: string | null; last_name: string | null; father_name?: string | null }
          | { first_name: string | null; last_name: string | null; father_name?: string | null }[]
          | null;
      };
    };
    const reqRaw = r.requests;
    const req = Array.isArray(reqRaw) ? reqRaw[0] : reqRaw;
    const contact = req ? (Array.isArray(req.contacts) ? req.contacts[0] : req.contacts) : null;
    return {
      id: r.request_id,
      requestId: req?.id ?? r.request_id,
      title: req?.title ?? "—",
      contactName: contact
        ? formatGreekContactName(contact.last_name, contact.first_name, contact.father_name)
        : "—",
      viewed_at: r.viewed_at,
    };
  });

  return { recentContactViews, recentRequestViews };
}

/** Group distribution — shared 60s cache (not per-user). */
export async function fetchDashboardGroups(supabase: SupabaseClient): Promise<GroupDistributionRow[]> {
  const cached = groupsCache.get();
  if (cached.hit) {
    console.log(`[dashboard] groups cache HIT age=${cached.ageMs}ms`);
    return cached.value;
  }

  const [tGroupDist, tGroupsMeta] = await Promise.all([
    timedFetch("group_distribution", supabase.rpc("get_group_distribution", {})),
    timedFetch("contact_groups", supabase.from("contact_groups").select("id, name, color")),
  ]);
  logFetchTimings("dashboard", [tGroupDist, tGroupsMeta]);

  const groupRes = tGroupDist.value;
  const groupsMetaRes = tGroupsMeta.value;

  type GroupRpc = { group_name: string; color: string | null; count: number };
  const groupRows = (groupRes.data ?? []) as GroupRpc[];
  const metaByName = new Map(
    ((groupsMetaRes.data ?? []) as Array<{ id: string; name: string; color: string | null }>).map((g) => [
      g.name,
      g,
    ]),
  );

  const groups: GroupDistributionRow[] = groupRows
    .filter((g) => Number(g.count) > 0)
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 5)
    .map((g) => {
      const meta = metaByName.get(g.group_name);
      return {
        id: meta?.id ?? g.group_name,
        name: g.group_name,
        color: g.color ?? meta?.color ?? null,
        count: Number(g.count),
      };
    });

  groupsCache.set(groups);
  return groups;
}

/** Fast path: shared lists + per-user views (no groups). */
export async function fetchDashboardWidgetsFast(
  supabase: SupabaseClient,
  userId: string,
): Promise<Omit<DashboardWidgetsData, "groups"> & { groups: [] }> {
  const [shared, views] = await Promise.all([
    fetchDashboardWidgetsShared(supabase),
    fetchDashboardWidgetsUserViews(supabase, userId),
  ]);
  return {
    ...shared,
    ...views,
    groups: [],
  };
}

export async function fetchDashboardWidgetsData(
  supabase: SupabaseClient,
  userId: string,
): Promise<DashboardWidgetsData> {
  const [fast, groups] = await Promise.all([
    fetchDashboardWidgetsFast(supabase, userId),
    fetchDashboardGroups(supabase),
  ]);
  return { ...fast, groups };
}
