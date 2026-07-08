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

/** Normalize a query list param that may arrive as repeated keys or a CSV string. */
function getListParam(sp: URLSearchParams, key: string, aliases: string[] = []): string[] {
  const keys = [key, `${key}[]`, ...aliases];
  const collected: string[] = [];
  for (const k of keys) {
    const all = sp.getAll(k);
    if (all.length > 0) {
      for (const raw of all) {
        if (!raw?.trim()) continue;
        collected.push(...raw.split(",").map((x) => x.trim()).filter(Boolean));
      }
      continue;
    }
    const single = sp.get(k);
    if (single?.trim()) {
      collected.push(...single.split(",").map((x) => x.trim()).filter(Boolean));
    }
  }
  return [...new Set(collected)];
}

/** Write normalized arrays back onto URLSearchParams so downstream parsers always see arrays/CSV cleanly. */
function setListParam(sp: URLSearchParams, key: string, values: string[]) {
  sp.delete(key);
  sp.delete(`${key}[]`);
  for (const v of values) sp.append(key, v);
}

const SELECT_EXPORT =
  "id, contact_code, first_name, last_name, nickname, father_name, mother_name, phone, phone2, landline, email, municipality, area, toponym, electoral_district, political_stance, call_status, priority, group_id, tags, notes, created_at";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Normalize ALL list params to arrays BEFORE any other logic (string vs array mismatch).
    const municipalities = getListParam(searchParams, "municipalities", ["municipality"]);
    const toponyms = getListParam(searchParams, "toponyms", ["toponym"]);
    const call_statuses = getListParam(searchParams, "call_statuses", ["call_status_in"]);
    const source_ids = getListParam(searchParams, "source_ids");
    const exclude_source_ids = getListParam(searchParams, "exclude_source_ids");
    const group_ids = getListParam(searchParams, "group_ids", ["groups_include"]);
    const exclude_group_ids = getListParam(searchParams, "exclude_group_ids", ["groups_exclude"]);
    const tags = getListParam(searchParams, "tags", ["tag"]);
    const political_stances = getListParam(searchParams, "political_stances", ["political_stance"]);

    console.log("[api/contacts/export parsed]", {
      municipalities,
      toponyms,
      call_statuses,
      source_ids,
      exclude_source_ids,
      group_ids,
      exclude_group_ids,
      tags,
      political_stances,
    });

    const sp = new URLSearchParams(searchParams.toString());
    setListParam(sp, "municipalities", municipalities);
    setListParam(sp, "toponyms", toponyms);
    setListParam(sp, "call_statuses", call_statuses);
    setListParam(sp, "source_ids", source_ids);
    setListParam(sp, "exclude_source_ids", exclude_source_ids);
    setListParam(sp, "group_ids", group_ids);
    setListParam(sp, "exclude_group_ids", exclude_group_ids);
    if (tags.length) {
      sp.delete("tag");
      sp.set("tag", tags[0]!);
    }
    if (political_stances.length) {
      sp.delete("political_stance");
      sp.set("political_stance", political_stances[0]!);
    }

    const crm = await checkCRMAccess();
    if (!crm.allowed) {
      return jsonUtf8Error("Μη εξουσιοδοτημένη πρόσβαση.", crm.response.status);
    }
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "caller")) {
      return jsonUtf8Error("Δεν έχετε δικαίωμα εξαγωγής επαφών.", 403);
    }

    const idsParam = sp.get("ids");
    const format = sp.get("format");
    const filtered = sp.get("filters") === "1" || sp.get("filtered") === "1";
    const partialLocation = sp.get("partial_location") === "1";
    const f = normalizeContactListFiltersForNameRpc(
      searchParamsToFilters(sp, getDefaultContactFilters()),
    );

    // Ensure filter object uses the normalized arrays (never raw string params).
    f.municipalities = municipalities;
    f.toponyms = toponyms;
    if (call_statuses.length) f.call_statuses = call_statuses;
    f.source_ids = source_ids;
    f.exclude_source_ids = exclude_source_ids;
    f.group_ids = group_ids;
    f.exclude_group_ids = exclude_group_ids;
    if (tags.length && !f.tag) f.tag = tags[0]!;
    if (political_stances.length && !f.political_stance) f.political_stance = political_stances[0]!;

    console.info(
      "[api/contacts/export request]",
      JSON.stringify({
        format: format ?? "xlsx",
        filtered,
        has_ids: Boolean(idsParam?.trim()),
        municipalities_count: f.municipalities.length,
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
      "Δήμος που μένει",
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
