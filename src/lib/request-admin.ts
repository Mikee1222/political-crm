import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRequestStatusQueryValues,
  isCanonicalRequestStatus,
  REQUEST_STATUSES,
  type RequestStatus,
} from "@/lib/request-statuses";

export type RequestStatusWithCount = { status: RequestStatus; request_count: number };

export type RequestCategoryWithCount = {
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
): Promise<RequestCategoryWithCount[]> {
  const { data: cats, error } = await service
    .from("request_categories")
    .select("id, name, color")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  const results: RequestCategoryWithCount[] = [];
  for (const cat of cats ?? []) {
    const name = String(cat.name ?? "").trim();
    if (!name) continue;
    const { count, error: countErr } = await service
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("category", name);
    if (countErr) throw countErr;
    results.push({
      id: String(cat.id),
      name,
      color: String(cat.color ?? "#6B7280"),
      request_count: count ?? 0,
    });
  }

  return results;
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
  fromId: string,
  toId: string,
): Promise<number> {
  if (!fromId || !toId || fromId === toId) {
    throw new Error("Άκυρα ids");
  }

  const { data: rows, error: loadErr } = await service
    .from("request_categories")
    .select("id, name")
    .in("id", [fromId, toId]);

  if (loadErr) throw loadErr;

  const fromRow = rows?.find((r) => r.id === fromId);
  const toRow = rows?.find((r) => r.id === toId);
  const fromName = String(fromRow?.name ?? "").trim();
  const toName = String(toRow?.name ?? "").trim();

  if (!fromName || !toName) {
    throw new Error("Δεν βρέθηκαν οι κατηγορίες");
  }

  const { data: updated, error } = await service
    .from("requests")
    .update({ category: toName })
    .eq("category", fromName)
    .select("id");

  if (error) throw error;
  return updated?.length ?? 0;
}
