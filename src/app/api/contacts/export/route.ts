import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { hasMinRole } from "@/lib/roles";
import { todayYmdAthens } from "@/lib/date-format";
import {
  applyContactListFiltersToBuilder,
  contactMatchesLocalSearch,
} from "@/lib/contacts-query";
import { getDefaultContactFilters, searchParamsToFilters } from "@/lib/contacts-filters";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { callStatusLabel } from "@/lib/luxury-styles";
import {
  fetchGroupNamesByContactId,
  type GroupFilterResolution,
  groupResolutionForSqlBuilder,
  includeContactIdsNeedBatchFetch,
  excludeContactIdsNeedInMemoryFilter,
  resolveContactListFilterIds,
} from "@/lib/contact-group-members";
import { normalizeContactListFiltersForNameRpc } from "@/lib/alexandra-contact-search";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

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

function jsonUtf8Error(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeExportSearchParams(sp: URLSearchParams): URLSearchParams {
  const normalized = new URLSearchParams(sp.toString());
  const mergeCsv = (key: string, aliases: string[]) => {
    const values: string[] = [];
    for (const alias of aliases) {
      for (const raw of sp.getAll(alias)) {
        if (!raw?.trim()) continue;
        values.push(...raw.split(",").map((x) => x.trim()).filter(Boolean));
      }
    }
    if (values.length) {
      normalized.set(key, [...new Set(values)].join(","));
    }
  };

  mergeCsv("group_ids", ["group_ids", "group_ids[]", "groups_include", "groups_include[]"]);
  mergeCsv("exclude_group_ids", [
    "exclude_group_ids",
    "exclude_group_ids[]",
    "groups_exclude",
    "groups_exclude[]",
  ]);
  mergeCsv("source_ids", ["source_ids", "source_ids[]"]);
  mergeCsv("exclude_source_ids", ["exclude_source_ids", "exclude_source_ids[]"]);
  mergeCsv("municipalities", ["municipalities", "municipalities[]", "municipality"]);
  mergeCsv("toponyms", ["toponyms", "toponyms[]", "toponym"]);
  mergeCsv("call_statuses", ["call_statuses", "call_statuses[]", "call_status_in"]);

  return normalized;
}

const SELECT_EXPORT =
  "id, contact_code, first_name, last_name, nickname, father_name, mother_name, phone, phone2, landline, email, municipality, area, toponym, electoral_district, political_stance, call_status, priority, group_id, tags, notes, created_at";

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) {
      return jsonUtf8Error("Μη εξουσιοδοτημένη πρόσβαση.", crm.response.status);
    }
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "caller")) {
      return jsonUtf8Error("Δεν έχετε δικαίωμα εξαγωγής επαφών.", 403);
    }

    const sp = normalizeExportSearchParams(request.nextUrl.searchParams);
    const idsParam = sp.get("ids");
    const format = sp.get("format");
    const filtered = sp.get("filters") === "1" || sp.get("filtered") === "1";
    const partialLocation = sp.get("partial_location") === "1";
    const f = normalizeContactListFiltersForNameRpc(
      searchParamsToFilters(sp, getDefaultContactFilters()),
    );

    const fullParams: Record<string, string | string[]> = {};
    for (const key of [...new Set([...sp.keys()])]) {
      const values = sp.getAll(key);
      fullParams[key] = values.length > 1 ? values : (values[0] ?? "");
    }
    console.info(
      "[api/contacts/export request]",
      JSON.stringify({
        format: format ?? "xlsx",
        filtered,
        has_ids: Boolean(idsParam?.trim()),
        incoming_params: fullParams,
        group_ids_count: f.group_ids.length,
        exclude_group_ids_count: f.exclude_group_ids.length,
        source_ids_count: f.source_ids.length,
        exclude_source_ids_count: f.exclude_source_ids.length,
        has_search: Boolean(f.search?.trim()),
      }),
    );

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
      mergedFilterResolution = await resolveContactListFilterIds(supabase, f);
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
        qn = applyContactListFiltersToBuilder(qn, f, sqlGroupResolution, { partialLocation });
        query = qn;
      }
    } else if (filtered) {
      mergedFilterResolution = await resolveContactListFilterIds(supabase, f);
      const includeNeedMemory =
        mergedFilterResolution.includeContactIds !== null &&
        includeContactIdsNeedBatchFetch(mergedFilterResolution.includeContactIds);
      const sqlGroupResolution = groupResolutionForSqlBuilder({
        includeContactIds: includeNeedMemory ? null : mergedFilterResolution.includeContactIds,
        excludeContactIds: mergedFilterResolution.excludeContactIds,
      });
      query = applyContactListFiltersToBuilder(
        supabase.from("contacts").select(SELECT_EXPORT),
        f,
        sqlGroupResolution,
        { partialLocation },
      );
    } else {
      return jsonUtf8Error("Η εξαγωγή απαιτεί ενεργά φίλτρα ή επιλεγμένες επαφές.", 403);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) return jsonUtf8Error(error.message, 400);

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
      return new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        },
      );
    }

    const rows = rawRows.map((r) =>
      [
        r.contact_code ?? "",
        r.first_name ?? "",
        r.last_name ?? "",
        r.father_name ?? "",
        r.mother_name ?? "",
        r.phone ?? "",
        r.phone2 ?? "",
        r.landline ?? "",
        r.email ?? "",
        r.municipality ?? "",
        r.area ?? "",
        r.toponym ?? "",
        r.electoral_district ?? "",
        r.political_stance ?? "",
        callStatusLabel(r.call_status),
        priorityGr(r.priority),
        groupNamesByContact.get(r.id)?.join("; ") ?? "",
        tagsCell(r.tags),
        r.notes ?? "",
        r.created_at ? new Date(r.created_at).toISOString() : "",
      ],
    );
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Επαφές");
    const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="epafes-${athensYmd}.xlsx"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Άγνωστο σφάλμα εξαγωγής";
    console.error("[api/contacts/export]", e);
    return jsonUtf8Error(message, 500);
  }
}
