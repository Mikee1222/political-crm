import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { hasMinRole } from "@/lib/roles";
import { todayYmdAthens } from "@/lib/date-format";
import { getDefaultContactFilters, searchParamsToFilters } from "@/lib/contacts-filters";
import { callStatusLabel } from "@/lib/luxury-styles";
import {
  CONTACTS_EXPORT_LIMIT,
  queryContactsListRows,
} from "@/lib/contacts-list-api";
import {
  enrichContactsWithGroupCountsAndNames,
  fetchContactsByIncludeIdBatches,
  MAX_ID_IN_CLAUSE,
} from "@/lib/contact-group-members";
import { normalizeContactListFiltersForNameRpc } from "@/lib/alexandra-contact-search";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const SELECT_EXPORT =
  "id, contact_code, first_name, last_name, nickname, father_name, mother_name, phone, phone2, landline, email, municipality, area, toponym, electoral_district, political_stance, call_status, priority, group_id, tags, notes, created_at";

type ExportContactRow = {
  id: string;
  contact_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  phone?: string | null;
  phone2?: string | null;
  landline?: string | null;
  email?: string | null;
  municipality?: string | null;
  area?: string | null;
  toponym?: string | null;
  electoral_district?: string | null;
  political_stance?: string | null;
  call_status?: string | null;
  priority?: string | null;
  group_id?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  created_at?: string | null;
  group_names?: string[];
};

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

/** Log PostgREST / Supabase errors with full fields (no secrets). */
function logSupabaseError(err: unknown, phase: string) {
  const e = err as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
  console.error("[api/contacts/export supabase error]", {
    phase,
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
    raw: err,
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

/**
 * List RPC rows omit mother_name / notes. Hydrate those columns (chunked) when missing,
 * preserving order of `rows`.
 */
async function hydrateExportColumns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: ExportContactRow[],
): Promise<ExportContactRow[]> {
  if (!rows.length) return rows;
  const needsHydrate = rows.some(
    (r) => r.mother_name === undefined || r.notes === undefined,
  );
  if (!needsHydrate) return rows;

  const ids = rows.map((r) => r.id);
  const byId = new Map<string, { mother_name: string | null; notes: string | null }>();
  for (let i = 0; i < ids.length; i += MAX_ID_IN_CLAUSE) {
    const chunk = ids.slice(i, i + MAX_ID_IN_CLAUSE);
    const { data, error } = await supabase
      .from("contacts")
      .select("id, mother_name, notes")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as { id: string; mother_name: string | null; notes: string | null };
      byId.set(r.id, { mother_name: r.mother_name, notes: r.notes });
    }
  }

  return rows.map((r) => {
    const extra = byId.get(r.id);
    if (!extra) return r;
    return {
      ...r,
      mother_name: r.mother_name ?? extra.mother_name,
      notes: r.notes ?? extra.notes,
    };
  });
}

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
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "caller")) {
      return jsonUtf8Error("Δεν έχετε δικαίωμα εξαγωγής επαφών.", 403);
    }

    console.info("[api/contacts/export client]", {
      mode: "authenticated_session",
      has_user_id: Boolean(user?.id),
      user_id: user?.id ? `${String(user.id).slice(0, 8)}…` : null,
      role: profile?.role ?? null,
      uses_buildContactQueryPlan: true,
      note: "export uses queryContactsListRows (same buildContactQueryPlan + execute pipeline as /api/contacts)",
    });

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
        municipalities: f.municipalities,
        group_ids_count: f.group_ids.length,
        exclude_group_ids_count: f.exclude_group_ids.length,
        source_ids_count: f.source_ids.length,
        exclude_source_ids_count: f.exclude_source_ids.length,
        has_search: Boolean(f.search?.trim()),
      }),
    );

    let rawRows: ExportContactRow[] = [];
    let planPath: string | undefined;
    let planReason: string | undefined;

    try {
      if (idsParam?.trim()) {
        const ids = idsParam
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (ids.length) {
          rawRows = (await fetchContactsByIncludeIdBatches(
            supabase,
            ids,
            SELECT_EXPORT,
            (q) => q,
          )) as ExportContactRow[];
          planPath = "selected-ids";
        }
      } else if (filtered) {
        const result = await queryContactsListRows(supabase, f, {
          partialLocation,
          limit: CONTACTS_EXPORT_LIMIT,
        });
        planPath = result.subPath ?? result.plan.path;
        planReason = result.plan.reason;
        rawRows = result.contacts as ExportContactRow[];
        console.info("[api/contacts/export plan]", {
          path: result.plan.path,
          subPath: result.subPath,
          reason: result.plan.reason,
          total: result.total,
          returned: rawRows.length,
        });
      } else {
        return jsonUtf8Error("Η εξαγωγή απαιτεί ενεργά φίλτρα ή επιλεγμένες επαφές.", 403);
      }
    } catch (err) {
      logSupabaseError(err, `queryContactsListRows:${planPath ?? "unknown"}`);
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Σφάλμα ερωτήματος Supabase";
      return jsonUtf8Error(msg, 400);
    }

    try {
      rawRows = await hydrateExportColumns(supabase, rawRows);
    } catch (err) {
      logSupabaseError(err, "hydrateExportColumns");
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Σφάλμα συμπλήρωσης στηλών εξαγωγής";
      return jsonUtf8Error(msg, 400);
    }

    let enriched: ExportContactRow[];
    try {
      enriched = (await enrichContactsWithGroupCountsAndNames(
        supabase,
        rawRows,
      )) as ExportContactRow[];
    } catch (err) {
      logSupabaseError(err, "enrichContactsWithGroupCountsAndNames");
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Σφάλμα ονομάτων ομάδων";
      return jsonUtf8Error(msg, 400);
    }

    console.info("[api/contacts/export done]", {
      planPath,
      planReason,
      rowCount: enriched.length,
    });

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
      "Δήμος που ψηφίζει",
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
          contacts: enriched.map((r) => ({
            id: r.id,
            first_name: r.first_name,
            last_name: r.last_name,
            father_name: r.father_name,
            phone: r.phone,
            municipality: r.municipality,
            groups: r.group_names ?? [],
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

    const rows = enriched.map((r) =>
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
        (r.group_names ?? []).join("; "),
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
