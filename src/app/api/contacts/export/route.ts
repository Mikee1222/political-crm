import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { hasPermissionFlexible } from "@/lib/permission-check";
import { todayYmdAthens } from "@/lib/date-format";
import {
  applyContactListFiltersToBuilder,
  contactMatchesLocalSearch,
} from "@/lib/contacts-query";
import { getDefaultContactFilters, searchParamsToFilters } from "@/lib/contacts-filters";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { callStatusLabel } from "@/lib/luxury-styles";
import { nextJsonError } from "@/lib/api-resilience";
import {
  fetchGroupNamesByContactId,
  type GroupFilterResolution,
  groupResolutionForSqlBuilder,
  includeContactIdsNeedBatchFetch,
  excludeContactIdsNeedInMemoryFilter,
  mergeContactListFilterResolutions,
  resolveContactListFilterIds,
  resolveGroupFilterContactIds,
} from "@/lib/contact-group-members";
import { normalizeContactListFiltersForNameRpc } from "@/lib/alexandra-contact-search";

export const dynamic = "force-dynamic";

function escapeCsvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function priorityGr(p: string | null | undefined): string {
  if (p === "High") return "Υψηλή";
  if (p === "Low") return "Χαμηλή";
  if (p === "Medium") return "Μεσαία";
  return p ?? "";
}

function tagsCell(tags: string[] | null | undefined): string {
  if (!tags || !Array.isArray(tags)) return "";
  return tags.filter(Boolean).join("; ");
}

const SELECT_EXPORT =
  "id, contact_code, first_name, last_name, nickname, father_name, mother_name, phone, phone2, landline, email, municipality, area, toponym, electoral_district, political_stance, call_status, priority, group_id, tags, notes, created_at";

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "caller")) {
      return forbidden();
    }

    const sp = request.nextUrl.searchParams;
    const idsParam = sp.get("ids");
    const format = sp.get("format");
    const filtered = sp.get("filters") === "1" || sp.get("filtered") === "1";
    const f = normalizeContactListFiltersForNameRpc(
      searchParamsToFilters(sp, getDefaultContactFilters()),
    );

    console.info(
      "[api/contacts/export request]",
      JSON.stringify({
        format: format ?? "csv",
        filtered,
        has_ids: Boolean(idsParam?.trim()),
        param_keys: [...new Set([...sp.keys()])],
        group_ids_count: f.group_ids.length,
        exclude_group_ids_count: f.exclude_group_ids.length,
        source_ids_count: f.source_ids.length,
        exclude_source_ids_count: f.exclude_source_ids.length,
        has_search: Boolean(f.search?.trim()),
      }),
    );

    const isManager = hasMinRole(profile?.role, "manager");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase.from("contacts").select(SELECT_EXPORT);
    let mergedFilterResolution: GroupFilterResolution | null = null;

    if (idsParam?.trim()) {
      const ids = idsParam
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (ids.length) query = query.in("id", ids);
    } else if (filtered && f.nameday_today) {
      mergedFilterResolution = mergeContactListFilterResolutions(
        await resolveGroupFilterContactIds(supabase, f),
        await resolveContactListFilterIds(supabase, f),
      );
      const now = new Date();
      const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
      if (ids.length === 0) {
        query = supabase.from("contacts").select(SELECT_EXPORT).limit(0);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let qn: any = supabase.from("contacts").select(SELECT_EXPORT).in("id", ids);
        const includeNeedMemory =
          mergedFilterResolution.includeContactIds !== null &&
          includeContactIdsNeedBatchFetch(mergedFilterResolution.includeContactIds);
        const sqlGroupResolution = groupResolutionForSqlBuilder({
          includeContactIds: includeNeedMemory ? null : mergedFilterResolution.includeContactIds,
          excludeContactIds: mergedFilterResolution.excludeContactIds,
        });
        qn = applyContactListFiltersToBuilder(qn, f, sqlGroupResolution);
        query = qn;
      }
    } else if (filtered) {
      mergedFilterResolution = mergeContactListFilterResolutions(
        await resolveGroupFilterContactIds(supabase, f),
        await resolveContactListFilterIds(supabase, f),
      );
      const includeNeedMemory =
        mergedFilterResolution.includeContactIds !== null &&
        includeContactIdsNeedBatchFetch(mergedFilterResolution.includeContactIds);
      const sqlGroupResolution = groupResolutionForSqlBuilder({
        includeContactIds: includeNeedMemory ? null : mergedFilterResolution.includeContactIds,
        excludeContactIds: mergedFilterResolution.excludeContactIds,
      });
      query = applyContactListFiltersToBuilder(supabase.from("contacts").select(SELECT_EXPORT), f, sqlGroupResolution);
    } else {
      const canFullExport = await hasPermissionFlexible(user.id, "contacts_export", isManager);
      if (!canFullExport) {
        return NextResponse.json({ error: "Η εξαγωγή όλων απαιτεί δικαιώματα υπευθύνου" }, { status: 403 });
      }
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    let rawRows = (data ?? []) as Array<{
      id: string;
      contact_code: string | null;
      first_name: string;
      last_name: string;
      nickname: string | null;
      father_name: string | null;
      mother_name: string | null;
      phone: string | null;
      phone2: string | null;
      landline: string | null;
      email: string | null;
      municipality: string | null;
      area: string | null;
      toponym: string | null;
      electoral_district: string | null;
      political_stance: string | null;
      call_status: string | null;
      priority: string | null;
      group_id: string | null;
      tags: string[] | null;
      notes: string | null;
      created_at: string | null;
    }>;

    if (filtered && mergedFilterResolution) {
      const includeNeedMemory =
        mergedFilterResolution.includeContactIds !== null &&
        includeContactIdsNeedBatchFetch(mergedFilterResolution.includeContactIds);
      const includeSet = includeNeedMemory && mergedFilterResolution.includeContactIds
        ? new Set(mergedFilterResolution.includeContactIds)
        : null;
      if (includeSet) {
        rawRows = rawRows.filter((row) => includeSet.has(row.id));
      }

      if (excludeContactIdsNeedInMemoryFilter(mergedFilterResolution.excludeContactIds)) {
        const excludeSet = new Set(mergedFilterResolution.excludeContactIds);
        rawRows = rawRows.filter((row) => !excludeSet.has(row.id));
      }
    }

    if (filtered && f.search?.trim()) {
      rawRows = rawRows.filter((c) => contactMatchesLocalSearch(c, f.search));
    }

    const groupNamesByContact = await fetchGroupNamesByContactId(
      supabase,
      rawRows.map((r) => r.id),
    );

    const header = [
      "Κωδικός επαφής",
      "Όνομα",
      "Επίθετο",
      "Όνομα πατέρα",
      "Όνομα μητέρας",
      "Τηλέφωνο 1",
      "Τηλέφωνο 2",
      "Σταθερό",
      "Email",
      "Δήμος",
      "Περιοχή",
      "Τοπωνύμιο",
      "Εκλ. διαμέρισμα",
      "Πολιτική στάση",
      "Κατάσταση κλήσης",
      "Προτεραιότητα",
      "Ομάδα",
      "Ετικέτες",
      "Σημειώσεις",
      "Ημ/νία δημιουργίας",
    ];

    const athensYmd = todayYmdAthens();

    if (format === "json") {
      return NextResponse.json({
        contacts: rawRows.map((r) => ({
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          father_name: r.father_name,
          phone: r.phone,
          municipality: r.municipality,
          groups: groupNamesByContact.get(r.id) ?? [],
          political_stance: r.political_stance,
        })),
      });
    }

    const lines = [
      header.map(escapeCsvCell).join(","),
      ...rawRows.map((r) =>
        [
          r.contact_code,
          r.first_name,
          r.last_name,
          r.father_name,
          r.mother_name,
          r.phone,
          r.phone2,
          r.landline,
          r.email,
          r.municipality,
          r.area,
          r.toponym,
          r.electoral_district,
          r.political_stance,
          callStatusLabel(r.call_status),
          priorityGr(r.priority),
          groupNamesByContact.get(r.id)?.join("; ") ?? "",
          tagsCell(r.tags),
          r.notes,
          r.created_at ? new Date(r.created_at).toISOString() : "",
        ]
          .map(escapeCsvCell)
          .join(","),
      ),
    ];
    const csv = "\uFEFF" + lines.join("\r\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="epafes-${athensYmd}.csv"`,
      },
    });
  } catch (e) {
    console.error("[api/contacts/export]", e);
    return nextJsonError();
  }
}
