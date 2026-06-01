import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
import { addDaysYmd, computeSlaStatus } from "@/lib/request-sla";
import { inferRequestCategoryFromDescription } from "@/lib/request-auto-category";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRequestStatusQueryValues,
  normalizeRequestStatus,
  REQUEST_STATUSES,
  REQUEST_STATUS_OPEN,
} from "@/lib/request-statuses";
import { searchParamsToRequestFilters } from "@/lib/requests-filters";
import {
  applyRequestListFiltersToBuilder,
  resolvePhoneContactIds,
  resolveRequestListFilters,
} from "@/lib/requests-query";
import type { RequestListFilters } from "@/lib/requests-filters";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_SELECT =
  "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, contact_id, affected_contact_id, sla_due_date, sla_status, contacts!contact_id(first_name,last_name,phone)";

const FALLBACK_SELECT =
  "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, contact_id, affected_contact_id, sla_due_date, sla_status";

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

  let query = supabase
    .from("requests")
    .select(BASE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });
  query = await applyRequestListFiltersToBuilder(query, supabase, f, resolution, {
    withSearchEmbed: Boolean(f.search),
    contactIdsFromPhone,
  });
  query = query.range(from, to);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any = null;
  let count: number | null = null;

  const first = await query;
  data = first.data;
  error = first.error;
  count = first.count;

  if (error && f.search) {
    let q2 = supabase
      .from("requests")
      .select(FALLBACK_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });
    q2 = await applyRequestListFiltersToBuilder(q2, supabase, f, resolution, {
      withSearchEmbed: false,
      contactIdsFromPhone,
    });
    q2 = q2.range(from, to);
    const second = await q2;
    data = second.data;
    error = second.error;
    count = second.count;
  } else if (error) {
    console.warn("[api/requests GET] embed failed, falling back without contacts:", error.message);
    let q2 = supabase
      .from("requests")
      .select(FALLBACK_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });
    q2 = await applyRequestListFiltersToBuilder(q2, supabase, f, resolution, {
      withSearchEmbed: false,
      contactIdsFromPhone,
    });
    q2 = q2.range(from, to);
    const second = await q2;
    data = second.data;
    error = second.error;
    count = second.count;
  }

  return { data, error, count };
}

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const sp = request.nextUrl.searchParams;
    const f = searchParamsToRequestFilters(sp);

    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(sp.get("page_size") || "50", 10) || 50),
    );

    const [{ data, error, count }, statusCounts, totalAllR] = await Promise.all([
      fetchRequestsPage(supabase, f, page, pageSize),
      Promise.all(
        REQUEST_STATUSES.map(async (s) => {
          const { count: c } = await supabase
            .from("requests")
            .select("*", { count: "exact", head: true })
            .in("status", getRequestStatusQueryValues(s));
          return { status: s, count: c ?? 0 };
        }),
      ),
      supabase.from("requests").select("*", { count: "exact", head: true }),
    ]);

    if (error) {
      console.error("[api/requests GET]", error);
      return NextResponse.json({
        data: [],
        count: 0,
        page,
        page_size: pageSize,
        total_pages: 0,
        statusCounts: REQUEST_STATUSES.map((s) => ({ status: s, count: 0 })),
        totalCount: 0,
      });
    }

    const total = count ?? 0;
    const total_pages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return NextResponse.json({
      data: mapRequestRows((data ?? []) as unknown[]),
      count: total,
      page,
      page_size: pageSize,
      total_pages,
      statusCounts,
      totalCount: totalAllR.count ?? 0,
      requests: mapRequestRows((data ?? []) as unknown[]),
    });
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
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

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
