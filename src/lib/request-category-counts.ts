import type { SupabaseClient } from "@supabase/supabase-js";

export type RequestCategoryCountRow = {
  name: string;
  request_count: number;
};

const DEFAULT_COLOR = "#6B7280";

/** Distinct category names from requests.category with usage counts. */
export async function getRequestCategoryCounts(
  service: SupabaseClient,
): Promise<RequestCategoryCountRow[]> {
  const { data, error } = await service.rpc("get_request_category_counts");
  if (error) throw error;
  type RpcRow = { name?: string; request_count?: number | string };
  return (data as RpcRow[] | null ?? [])
    .map((row: RpcRow) => ({
      name: String(row.name ?? "").trim(),
      request_count: Number(row.request_count ?? 0),
    }))
    .filter((r: RequestCategoryCountRow) => r.name);
}

export type RequestCategoryMeta = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  sla_days?: number | null;
};

/** Lookup colors / SLA from request_categories; id falls back to name when no row exists. */
export async function loadRequestCategoryMeta(
  supabase: SupabaseClient,
): Promise<Map<string, RequestCategoryMeta>> {
  const { data, error } = await supabase
    .from("request_categories")
    .select("id, name, color, sort_order, sla_days");
  if (error) throw error;
  const map = new Map<string, RequestCategoryMeta>();
  for (const row of data ?? []) {
    const name = String((row as { name: string }).name ?? "").trim();
    if (!name) continue;
    const r = row as {
      id: string;
      color?: string;
      sort_order?: number;
      sla_days?: number | null;
    };
    map.set(name, {
      id: String(r.id),
      name,
      color: String(r.color ?? DEFAULT_COLOR),
      sort_order: Number(r.sort_order ?? 0),
      sla_days: r.sla_days ?? null,
    });
  }
  return map;
}

export function mergeCategoryCountsWithMeta(
  counts: RequestCategoryCountRow[],
  metaByName: Map<string, RequestCategoryMeta>,
): RequestCategoryMeta[] {
  const seen = new Set<string>();
  const out: RequestCategoryMeta[] = [];

  for (const { name } of counts) {
    seen.add(name);
    const meta = metaByName.get(name);
    out.push(
      meta ?? {
        id: name,
        name,
        color: DEFAULT_COLOR,
        sort_order: Number.MAX_SAFE_INTEGER,
      },
    );
  }

  for (const meta of metaByName.values()) {
    if (seen.has(meta.name)) continue;
    out.push(meta);
  }

  out.sort((a, b) => {
    const so = a.sort_order - b.sort_order;
    if (so !== 0) return so;
    return a.name.localeCompare(b.name, "el");
  });

  return out;
}
