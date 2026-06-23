import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
import { nameDayDateStringFromFirstName } from "@/lib/greek-namedays";
import { searchParamsToFilters, getDefaultContactFilters } from "@/lib/contacts-filters";
import { applyContactListFiltersToBuilder } from "@/lib/contacts-query";
import {
  enrichContactsWithGroupCountsAndNames,
  insertContactGroupMembershipsAfterCreate,
  normalizeGroupIdsInput,
  resolveContactListFilterIds,
  type GroupFilterResolution,
} from "@/lib/contact-group-members";
export const dynamic = "force-dynamic";

const SELECT_LIST =
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, call_status, priority, tags, nickname, contact_code, age, political_stance, group_id, birthday, predicted_score, is_volunteer, volunteer_role, volunteer_area, volunteer_since, language, last_contacted_at, father_name, name_day, is_dead, contact_groups!contacts_group_id_fkey ( id, name, color, description, year )";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

function parseOptionalInt(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function applyBirthdayAgeFilters(query: QueryBuilder, ageMin: string, ageMax: string) {
  const minAge = parseOptionalInt(ageMin);
  const maxAge = parseOptionalInt(ageMax);
  if (minAge == null && maxAge == null) return query;

  const now = new Date();
  if (maxAge != null) {
    const minDate = new Date(now.getFullYear() - maxAge, now.getMonth(), now.getDate());
    query = query.gte("birthday", minDate.toISOString().split("T")[0]);
  }
  if (minAge != null) {
    const maxDate = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
    query = query.lte("birthday", maxDate.toISOString().split("T")[0]);
  }
  return query;
}

function applyApiContactFilters(
  query: QueryBuilder,
  f: ReturnType<typeof getDefaultContactFilters>,
  groupResolution: GroupFilterResolution | undefined,
  partialLocation = false,
) {
  const filtersWithoutAge = { ...f, age_min: "", age_max: "" };
  query = applyContactListFiltersToBuilder(query, filtersWithoutAge, groupResolution, {
    partialLocation,
  });
  return applyBirthdayAgeFilters(query, f.age_min, f.age_max);
}

function afterFilterRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  search: string | null | undefined,
) {
  if (!search) return rows;
  return rows.filter((c) => contactMatchesFuzzyGreekSearch(c, search));
}

function paginateList<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return { slice: rows.slice(from, from + pageSize), total };
}

async function enrichContactsWithGroupCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: Array<Record<string, unknown>>,
) {
  if (!rows.length) return rows;
  return enrichContactsWithGroupCountsAndNames(
    supabase,
    rows as { id: string; group_id?: string | null }[],
  );
}

function logContactsQueryError(
  context: string,
  error: { message: string; code?: string; details?: string; hint?: string },
  extra?: Record<string, unknown>,
) {
  console.error(`[api/contacts GET] ${context}`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    ...extra,
  });
}

async function resolveGroupFilterSafe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  f: ReturnType<typeof getDefaultContactFilters>,
): Promise<GroupFilterResolution | undefined> {
  const hasGroupFilter =
    f.group_ids.length > 0 || Boolean(f.group_id?.trim()) || f.exclude_group_ids.length > 0;
  if (!hasGroupFilter) return undefined;
  try {
    return await resolveContactListFilterIds(supabase, f);
  } catch (groupErr) {
    console.error("[api/contacts GET] group filter resolution failed", {
      error: groupErr instanceof Error ? groupErr.message : groupErr,
      stack: groupErr instanceof Error ? groupErr.stack : undefined,
      group_ids: f.group_ids,
      group_id: f.group_id,
      exclude_group_ids: f.exclude_group_ids,
      group_match: f.group_match,
    });
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const f = searchParamsToFilters(request.nextUrl.searchParams, getDefaultContactFilters());
    const partialLocation = request.nextUrl.searchParams.get("partial_location") === "1";
    const groupResolution = await resolveGroupFilterSafe(supabase, f);
    const limitParam = f.limit;
    const parsedLimit = limitParam != null && limitParam !== "" ? parseInt(limitParam, 10) : NaN;
    const listLimit = Number.isFinite(parsedLimit) ? Math.min(10_000, Math.max(1, parsedLimit)) : null;
    const comboboxMode = listLimit != null;
    const namedayToday = f.nameday_today;

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get("page_size") || "50", 10) || 50));

    if (namedayToday) {
      const now = new Date();
      const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
      if (ids.length === 0) {
        if (comboboxMode) {
          return NextResponse.json({ contacts: [] });
        }
        return NextResponse.json({ contacts: [], total: 0, page, pageSize });
      }
      let query: QueryBuilder = supabase
        .from("contacts")
        .select(SELECT_LIST)
        .in("id", ids)
        .order("created_at", { ascending: false });
      query = applyApiContactFilters(query, f, groupResolution, partialLocation);
      if (comboboxMode) {
        query = query.limit(listLimit!);
      } else {
        const cap = 15_000;
        query = query.limit(cap);
      }
      const { data, error } = await query;
      if (error) {
        logContactsQueryError("nameday query", error, { group_ids: f.group_ids, nameday_today: true });
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const rows = data ?? [];
      const work = f.search ? afterFilterRows(rows, f.search) : rows;
      if (comboboxMode) {
        const enriched = await enrichContactsWithGroupCount(supabase, work.slice(0, listLimit!) as Record<string, unknown>[]);
        return NextResponse.json({ contacts: enriched });
      }
      const { slice, total } = paginateList(work, page, pageSize);
      const enriched = await enrichContactsWithGroupCount(supabase, slice as Record<string, unknown>[]);
      return NextResponse.json({ contacts: enriched, total, page, pageSize });
    }

    if (f.search) {
      let query: QueryBuilder = supabase.from("contacts").select(SELECT_LIST).order("created_at", { ascending: false });
      query = applyApiContactFilters(query, f, groupResolution, partialLocation);
      query = query.limit(12_000);
      const { data, error } = await query;
      if (error) {
        logContactsQueryError("search query", error, { group_ids: f.group_ids, search: f.search });
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const rows = data ?? [];
      const list = afterFilterRows(rows, f.search);
      if (comboboxMode) {
        const enriched = await enrichContactsWithGroupCount(supabase, list.slice(0, listLimit!) as Record<string, unknown>[]);
        return NextResponse.json({ contacts: enriched });
      }
      const { slice, total } = paginateList(list, page, pageSize);
      const enriched = await enrichContactsWithGroupCount(supabase, slice as Record<string, unknown>[]);
      return NextResponse.json({ contacts: enriched, total, page, pageSize });
    }

    let query: QueryBuilder = supabase
      .from("contacts")
      .select(SELECT_LIST, { count: "exact" })
      .order("created_at", { ascending: false });
    query = applyApiContactFilters(query, f, groupResolution, partialLocation);

    if (comboboxMode) {
      query = query.limit(listLimit!);
      const { data, error } = await query;
      if (error) {
        logContactsQueryError("combobox query", error, { group_ids: f.group_ids });
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const enriched = await enrichContactsWithGroupCount(supabase, data ?? []);
      return NextResponse.json({ contacts: enriched.slice(0, listLimit!) });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error) {
      logContactsQueryError("paginated query", error, { group_ids: f.group_ids, page, pageSize });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const enriched = await enrichContactsWithGroupCount(supabase, data ?? []);
    return NextResponse.json({ contacts: enriched, total: count ?? 0, page, pageSize });
  } catch (e) {
    console.error("[api/contacts GET] unhandled", {
      error: e instanceof Error ? e.message : e,
      stack: e instanceof Error ? e.stack : undefined,
      search: request.nextUrl.search,
    });
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
    delete body.contact_code;
    if (typeof body.phone === "string" && !body.phone.trim()) {
      body.phone = null;
    }
    for (const k of ["phone2", "landline"] as const) {
      if (typeof body[k] === "string" && !String(body[k]).trim()) {
        body[k] = null;
      }
    }
    const code = await nextPaddedCode(supabase, "contacts", "contact_code", "EP");
    body.contact_code = code;
    delete (body as { created_by?: unknown }).created_by;
    delete (body as { updated_by?: unknown }).updated_by;
    (body as Record<string, unknown>).created_by = user.id;
    if (
      (body.name_day == null || body.name_day === "") &&
      body.first_name != null &&
      String(body.first_name).trim() !== ""
    ) {
      const auto = nameDayDateStringFromFirstName(String(body.first_name));
      if (auto) body.name_day = auto;
    }
    const groupIds = normalizeGroupIdsInput(body);
    const primaryGroupId =
      groupIds !== undefined
        ? groupIds[0] ?? null
        : body.group_id != null && String(body.group_id).trim()
          ? String(body.group_id)
          : null;
    delete body.group_ids;
    if (groupIds !== undefined || "group_id" in body) {
      body.group_id = primaryGroupId;
    }
    const { data, error } = await supabase.from("contacts").insert(body).select("*").single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    try {
      await insertContactGroupMembershipsAfterCreate(supabase, String(data.id), {
        group_id: primaryGroupId,
        group_ids: groupIds,
      });
    } catch (memberErr) {
      console.error("[api/contacts POST] contact_group_members", memberErr);
      return NextResponse.json({ error: "Η επαφή δημιουργήθηκε αλλά απέτυχε η ανάθεση ομάδων" }, { status: 400 });
    }
    const name = `${String(data.first_name)} ${String(data.last_name)}`.trim();
    await logActivity({
      userId: user.id,
      action: "contact_created",
      entityType: "contact",
      entityId: data.id,
      entityName: name,
      details: { actor_name: firstNameFromFull(profile?.full_name) },
    });
    return NextResponse.json({ contact: data });
  } catch (e) {
    console.error("[api/contacts POST]", e);
    return nextJsonError();
  }
}
