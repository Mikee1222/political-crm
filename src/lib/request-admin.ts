import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRequestCategoryCounts,
  loadRequestCategoryMeta,
  type RequestCategoryCountRow,
} from "@/lib/request-category-counts";
import {
  getRequestStatusQueryValues,
  isCanonicalRequestStatus,
  REQUEST_STATUSES,
  type RequestStatus,
} from "@/lib/request-statuses";

export type RequestStatusWithCount = { status: RequestStatus; request_count: number };

export type RequestCategoryWithCount = {
  /** Lookup id when present in request_categories; otherwise same as name. */
  id: string;
  name: string;
  color: string;
  request_count: number;
};

export async function listRequestStatusesWithCounts(
  service: SupabaseClient,
): Promise<RequestStatusWithCount[]> {
  const results: RequestStatusWithCount[] = [];

  for (const status of REQUEST_STATUSES) {
    const values = getRequestStatusQueryValues(status);
    const { count, error } = await service
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", values);

    if (error) throw error;
    results.push({ status, request_count: count ?? 0 });
  }

  return results;
}

export async function transferRequestStatus(
  service: SupabaseClient,
  from: string,
  to: string,
): Promise<number> {
  if (!isCanonicalRequestStatus(from) || !isCanonicalRequestStatus(to)) {
    throw new Error("Άκυρη κατάσταση");
  }
  if (from === to) {
    throw new Error("Οι καταστάσεις πρέπει να διαφέρουν");
  }

  const fromValues = getRequestStatusQueryValues(from);
  const { data: updated, error } = await service
    .from("requests")
    .update({ status: to })
    .in("status", fromValues)
    .select("id");

  if (error) throw error;
  return updated?.length ?? 0;
}

export async function listRequestCategoriesWithCounts(
  service: SupabaseClient,
  metaClient?: SupabaseClient,
): Promise<RequestCategoryWithCount[]> {
  const counts = await getRequestCategoryCounts(service);
  const metaByName = metaClient ? await loadRequestCategoryMeta(metaClient) : new Map();

  return counts.map((row) => {
    const meta = metaByName.get(row.name);
    return {
      id: meta?.id ?? row.name,
      name: row.name,
      color: meta?.color ?? "#6B7280",
      request_count: row.request_count,
    };
  });
}

export async function countRequestsByCategoryName(
  service: SupabaseClient,
  name: string,
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) return 0;
  const { count, error } = await service
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("category", trimmed);
  if (error) throw error;
  return count ?? 0;
}

export async function transferRequestCategory(
  service: SupabaseClient,
  fromName: string,
  toName: string,
): Promise<number> {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from || !to) {
    throw new Error("Απαιτούνται ονόματα κατηγορίας");
  }
  if (from === to) {
    throw new Error("Οι κατηγορίες πρέπει να διαφέρουν");
  }

  const { data: updated, error } = await service
    .from("requests")
    .update({ category: to })
    .eq("category", from)
    .select("id");

  if (error) throw error;
  return updated?.length ?? 0;
}

export async function deleteRequestCategoryLookup(
  supabase: SupabaseClient,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Άκυρο όνομα");
  }
  const { error } = await supabase.from("request_categories").delete().eq("name", trimmed);
  if (error) throw error;
}

export type { RequestCategoryCountRow };
