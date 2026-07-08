import type { SupabaseClient } from "@supabase/supabase-js";
import { pad2, todayYmdAthens } from "@/lib/athens-ranges";
import { formatGreekContactName } from "@/lib/contact-display-name";
import { resolveNamedayNamesForDay } from "@/lib/namedays";

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

export async function fetchDashboardWidgetsData(
  supabase: SupabaseClient,
  userId: string,
): Promise<DashboardWidgetsData> {
  const today = todayYmdAthens();
  const tomorrow = ymdAddDays(today, 1);
  const dayAfter = ymdAddDays(today, 2);

  const [
    namedayToday,
    namedayTomorrow,
    namedayDayAfter,
    insertsRes,
    updatesRes,
    contactViewsRes,
    requestViewsRes,
    requestsRes,
    groupRes,
    groupsMetaRes,
  ] = await Promise.all([
    fetchNamedaysForYmd(supabase, today, "ΣΗΜΕΡΑ"),
    fetchNamedaysForYmd(supabase, tomorrow, "ΑΥΡΙΟ"),
    fetchNamedaysForYmd(supabase, dayAfter, "ΜΕΘΑΥΡΙΟ"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, father_name, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, father_name, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(25),
    supabase
      .from("contact_views")
      .select("contact_id, viewed_at, contacts!inner ( id, first_name, last_name, father_name )")
      .eq("user_id", userId)
      .order("viewed_at", { ascending: false })
      .limit(5),
    supabase
      .from("request_views")
      .select(
        "request_id, viewed_at, requests!inner ( id, title, contacts!requests_contact_id_fkey ( first_name, last_name, father_name ) )",
      )
      .eq("user_id", userId)
      .order("viewed_at", { ascending: false })
      .limit(5),
    supabase
      .from("requests")
      .select(
        "id, title, category, created_at, contacts!requests_contact_id_fkey ( first_name, last_name, father_name )",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("get_group_distribution", {}),
    supabase.from("contact_groups").select("id, name, color"),
  ]);

  const recentUpdates = (updatesRes.data ?? [])
    .filter((c) => {
      const row = c as { created_at?: string | null; updated_at?: string | null };
      if (!row.updated_at || !row.created_at) return false;
      return row.updated_at !== row.created_at;
    })
    .slice(0, 5)
    .map((c) =>
      mapContactRow(
        c as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          father_name?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        },
      ),
    );

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

  const recentRequests: DashboardRequestRow[] = (requestsRes.data ?? []).map((row) => {
    const r = row as {
      id: string;
      title: string | null;
      category: string | null;
      created_at: string | null;
      contacts:
        | { first_name: string | null; last_name: string | null; father_name?: string | null }
        | { first_name: string | null; last_name: string | null; father_name?: string | null }[]
        | null;
    };
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

  return {
    namedays: [namedayToday, namedayTomorrow, namedayDayAfter],
    recentInserts: (insertsRes.data ?? []).map((c) =>
      mapContactRow(
        c as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          father_name?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        },
      ),
    ),
    recentUpdates,
    recentContactViews,
    recentRequestViews,
    recentRequests,
    groups,
  };
}
