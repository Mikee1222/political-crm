import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { hasMinRole } from "@/lib/roles";
import { requirePermissionFlexible } from "@/lib/require-permission-api";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
import { addDaysYmd, computeSlaStatus } from "@/lib/request-sla";
import { inferRequestCategoryFromDescription } from "@/lib/request-auto-category";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCanonicalRequestStatus,
  normalizeRequestStatus,
  REQUEST_STATUSES,
  REQUEST_STATUS_OPEN,
  type RequestStatus,
} from "@/lib/request-statuses";
import { searchParamsToRequestFilters } from "@/lib/requests-filters";
import {
  applyRequestListFiltersToBuilder,
  buildRequestListSelect,
  resolvePhoneContactIds,
  resolveRequestListFilters,
} from "@/lib/requests-query";
import type { RequestListFilters } from "@/lib/requests-filters";
import { createTtlCache } from "@/lib/ttl-cache";
import { createServerTiming, withServerTimingHeaders } from "@/lib/server-timing";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_SELECT = buildRequestListSelect(true, false);
const SEARCH_SELECT = buildRequestListSelect(true, true);
const FALLBACK_SELECT = buildRequestListSelect(false);
const REQUEST_COUNTS_CACHE_TTL_MS = 30_000;

type RequestCountsCachePayload = {
  statusCounts: Array<{ status: string; count: number }>;
  totalCount: number;
};

const requestCountsCache = createTtlCache<RequestCountsCachePayload>(REQUEST_COUNTS_CACHE_TTL_MS);

function mapRequestRows(data: unknown[]) {
  return (data ?? []).map((row) => {
    const r0 = row as { contacts?: unknown; sla_due_date?: string | null; status?: string | null };
    const c = r0.contacts;
    const contact = Array.isArray(c) ? c[0] : c;
    const status = normalizeRequestStatus(r0.status ?? null);
    const slaUi = computeSlaStatus(r0.sla_due_date ?? null, status);
    return { ...(row as Record<string, unknown>), status, contacts: contact ?? null, slaUi };
  });
}

async function fetchRequestsPage(
  supabase: SupabaseClient,
  f: RequestListFilters,
  page: number,
  pageSize: number,
) {
  const resolution = await resolveRequestListFilters(supabase, f);
  if (resolution.noMatch) {
    return { data: [], error: null, count: 0 };
  }

  const contactIdsFromPhone = f.search ? await resolvePhoneContactIds(supabase, f.search) : [];

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const withSearch = Boolean(f.search.trim());
  const primarySelect = withSearch ? SEARCH_SELECT : BASE_SELECT;

  let query = supabase.from("requests").select(primarySelect, { count: "exact" });
  query = applyRequestListFiltersToBuilder(query, f, resolution, {
    withSearchEmbed: withSearch,
    contactIdsFromPhone,
  });
  query = query.order("created_at", { ascending: false }).range(from, to);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any = null;
  let count: number | null = null;

  const first = await query;
  data = first.data;
  error = first.error;
  count = first.count;

  if (error && withSearch) {
    let q2 = supabase.from("requests").select(FALLBACK_SELECT, { count: "exact" });
    q2 = applyRequestListFiltersToBuilder(q2, f, resolution, {
      withSearchEmbed: false,
      contactIdsFromPhone,
    });
    q2 = q2.order("created_at", { ascending: false }).range(from, to);
    const second = await q2;
    data = second.data;
    error = second.error;
    count = second.count;
  } else if (error) {
    console.warn("[api/requests GET] embed failed, falling back without contacts:", error.message);
    let q2 = supabase.from("requests").select(FALLBACK_SELECT, { count: "exact" });
    q2 = applyRequestListFiltersToBuilder(q2, f, resolution, {
      withSearchEmbed: false,
      contactIdsFromPhone,
    });
    q2 = q2.order("created_at", { ascending: false }).range(from, to);
    const second = await q2;
    data = second.data;
    error = second.error;
    count = second.count;
  }

  return { data, error, count };
}

async function fetchStatusCountsOnce(supabase: SupabaseClient): Promise<RequestCountsCachePayload> {
  const tallies = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<
    RequestStatus,
    number
  >;

  // Single-pass GROUP BY via RPC (fallback: one select of status column).
  const rpc = await supabase.rpc("get_request_status_counts");
  if (!rpc.error && Array.isArray(rpc.data)) {
    for (const row of rpc.data as Array<{ status?: string | null; cnt?: number | string | null }>) {
      const canonical = getCanonicalRequestStatus(row.status);
      const n = Number(row.cnt ?? 0);
      if (Number.isFinite(n)) tallies[canonical] += n;
    }
  } else {
    if (rpc.error) {
      console.warn("[api/requests] get_request_status_counts RPC failed, falling back:", rpc.error.message);
    }
    const { data, error } = await supabase.from("requests").select("status");
    if (error) throw error;
    for (const row of data ?? []) {
      const canonical = getCanonicalRequestStatus((row as { status?: string | null }).status);
      tallies[canonical] += 1;
    }
  }

  const statusCounts = REQUEST_STATUSES.map((status) => ({ status, count: tallies[status] }));
  const totalCount = statusCounts.reduce((sum, row) => sum + row.count, 0);
  return { statusCounts, totalCount };
}

async function fetchCachedRequestCounts(
  supabase: SupabaseClient,
): Promise<RequestCountsCachePayload & { cache: "HIT" | "MISS" }> {
  const hit = requestCountsCache.get();
  if (hit.hit) {
    console.log(`[api/requests] status counts cache HIT age=${hit.ageMs}ms`);
    return { ...hit.value, cache: "HIT" };
  }

  console.log("[api/requests] status counts cache MISS — fetching");
  const t0 = Date.now();
  const payload = await fetchStatusCountsOnce(supabase);
  requestCountsCache.set(payload);
  console.log(`[api/requests] status counts cache STORE took=${Date.now() - t0}ms ttl=30s`);
  return { ...payload, cache: "MISS" };
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming();
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    const denied = await requirePermissionFlexible(
      crm,
      "requests_view",
      hasMinRole(profile?.role, "manager"),
    );
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const f = searchParamsToRequestFilters(sp);
    const skipCounts = sp.get("skip_counts") === "1";

    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(sp.get("page_size") || "50", 10) || 50),
    );

    const pagePromise = timing.time("page", () => fetchRequestsPage(supabase, f, page, pageSize));
    const countsPromise = skipCounts
      ? Promise.resolve(null)
      : timing.time("counts", () => fetchCachedRequestCounts(supabase));

    const [{ data, error, count }, countsPayload] = await Promise.all([
      pagePromise,
      countsPromise,
    ]);

    if (error) {
      console.error("[api/requests GET]", error);
      return withServerTimingHeaders(
        NextResponse.json({
          data: [],
          count: 0,
          page,
          page_size: pageSize,
          total_pages: 0,
          statusCounts: REQUEST_STATUSES.map((s) => ({ status: s, count: 0 })),
          totalCount: 0,
        }),
        timing,
      );
    }

    const total = count ?? 0;
    const total_pages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const mapped = mapRequestRows((data ?? []) as unknown[]);

    return withServerTimingHeaders(
      NextResponse.json({
        data: mapped,
        count: total,
        page,
        page_size: pageSize,
        total_pages,
        ...(countsPayload
          ? {
              statusCounts: countsPayload.statusCounts,
              totalCount: countsPayload.totalCount,
              countsCache: countsPayload.cache,
            }
          : { countsOmitted: true }),
        requests: mapped,
      }),
      timing,
    );
  } catch (e) {
    console.error("[api/requests GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    const denied = await requirePermissionFlexible(
      crm,
      "requests_create",
      hasMinRole(profile?.role, "manager"),
    );
    if (denied) return denied;

    const body = (await request.json()) as Record<string, unknown>;
    const initialNote = String((body as { initial_note?: string }).initial_note ?? "").trim();
    const contactId = String((body as { contact_id?: string }).contact_id ?? "").trim();
    if (!contactId) {
      return NextResponse.json({ error: "Απαιτείται «Πρόσωπο που το ζήτησε»" }, { status: 400 });
    }
    const title = String((body as { title?: string }).title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Απαιτείται τίτλος" }, { status: 400 });
    }
    const descRaw = String((body as { description?: string }).description ?? "");
    const catRaw = (body as { category?: string }).category;
    let categoryName =
      catRaw != null && String(catRaw).trim() !== "" ? String(catRaw).trim() : "";
    if (!categoryName) {
      const inferred = await inferRequestCategoryFromDescription(descRaw);
      if (inferred) {
        categoryName = inferred;
      } else {
        categoryName = "Άλλο";
      }
    }
    const { data: catRow } = await supabase
      .from("request_categories")
      .select("sla_days")
      .eq("name", categoryName)
      .maybeSingle();
    const slaDays =
      typeof (catRow as { sla_days?: number } | null)?.sla_days === "number"
        ? (catRow as { sla_days: number }).sla_days
        : 14;
    const st = normalizeRequestStatus((body as { status?: string }).status ?? REQUEST_STATUS_OPEN);
    const now = new Date();
    const formSla = (body as { sla_due_date?: string | null }).sla_due_date;
    const explicitSla =
      typeof formSla === "string" && /^\d{4}-\d{2}-\d{2}$/.test(formSla.trim());
    const slaDue = explicitSla
      ? formSla.trim()
      : addDaysYmd(now.toISOString(), slaDays);
    const pr = String((body as { priority?: string }).priority ?? "Medium");
    const priority =
      pr === "High" || pr === "Low" || pr === "Medium" || pr === "Urgent" ? pr : "Medium";
    const affectedRaw = (body as { affected_contact_id?: string | null }).affected_contact_id;
    const affectedContactId =
      affectedRaw == null || String(affectedRaw).trim() === "" ? null : String(affectedRaw).trim();
    const assigned = (body as { assigned_to?: string | null }).assigned_to;
    const assignedTo =
      assigned != null && String(assigned).trim() !== "" ? String(assigned).trim() : null;
    const insertRow: Record<string, unknown> = {
      contact_id: contactId,
      affected_contact_id: affectedContactId,
      title,
      description: (body as { description?: string }).description
        ? String((body as { description?: string }).description)
        : null,
      category: categoryName,
      status: st,
      priority,
      assigned_to: assignedTo,
    };
    const code = await nextPaddedCode(supabase, "requests", "request_code", "AIT");
    const slaStatus = computeSlaStatus(slaDue, String(st));
    const payload = {
      ...insertRow,
      request_code: code,
      updated_at: new Date().toISOString(),
      sla_due_date: slaDue,
      sla_status: slaStatus,
    };
    const { data, error } = await supabase.from("requests").insert(payload).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const newId = (data as { id: string }).id;
    const personRows: { request_id: string; contact_id: string; role: string }[] = [
      { request_id: newId, contact_id: contactId, role: "requester" },
    ];
    if (affectedContactId) {
      personRows.push({ request_id: newId, contact_id: affectedContactId, role: "affected" });
    }
    await supabase.from("request_persons").upsert(personRows, {
      onConflict: "request_id,contact_id,role",
      ignoreDuplicates: true,
    });
    if (initialNote) {
      const { error: noteErr } = await supabase
        .from("request_notes")
        .insert({ request_id: newId, user_id: user.id, content: initialNote });
      if (noteErr) {
        await supabase.from("requests").delete().eq("id", newId);
        return NextResponse.json(
          { error: noteErr.message || "Δεν αποθηκεύτηκε η αρχική σημείωση" },
          { status: 400 },
        );
      }
    }
    const logTitle = String((data as { title?: string }).title ?? "Αίτημα");
    await logActivity({
      userId: user.id,
      action: "request_created",
      entityType: "request",
      entityId: (data as { id: string }).id,
      entityName: logTitle,
      details: { actor_name: firstNameFromFull(profile?.full_name) },
    });
    return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/requests POST]", e);
    return nextJsonError();
  }
}
