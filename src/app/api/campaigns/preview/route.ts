import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import {
  contactFilterHasCriteria,
  countPhonesForContactIds,
  listContactIdsMatching,
  parseCampaignFilterBody,
  type ContactFilter,
} from "@/lib/contacts-filter-query";
export const dynamic = "force-dynamic";

function parseCsvParam(request: NextRequest, key: string): string[] {
  const collected: string[] = [];
  for (const v of request.nextUrl.searchParams.getAll(key)) {
    collected.push(...v.split(","));
  }
  return [...new Set(collected.map((x) => x.trim()).filter(Boolean))];
}

function filterFromSearchParams(request: NextRequest): ContactFilter {
  const sp = request.nextUrl.searchParams;
  const municipalities = parseCsvParam(request, "municipalities");
  const muniSingle = sp.get("municipality")?.trim();
  const toponyms = parseCsvParam(request, "toponyms");
  const toponymSingle = sp.get("toponym")?.trim();
  return parseCampaignFilterBody({
    first_name: sp.get("first_name") ?? sp.get("name") ?? sp.get("search") ?? undefined,
    last_name: sp.get("last_name") ?? undefined,
    father_name: sp.get("father_name") ?? undefined,
    call_status: sp.get("call_status") ?? undefined,
    area: sp.get("area") ?? undefined,
    municipality: muniSingle,
    municipalities: municipalities.length ? municipalities : undefined,
    toponym: toponymSingle,
    toponyms: toponyms.length ? toponyms : undefined,
    priority: sp.get("priority") ?? undefined,
    tag: sp.get("tag") ?? undefined,
    group_ids: parseCsvParam(request, "group_ids"),
    exclude_group_ids: parseCsvParam(request, "exclude_group_ids"),
    gender: sp.get("gender") ?? undefined,
    political_stance: sp.get("political_stance") ?? undefined,
    age_min: sp.get("age_min") ?? undefined,
    age_max: sp.get("age_max") ?? undefined,
    age_groups: parseCsvParam(request, "age_groups"),
    // Preview always computes with/without on the unfiltered-by-phone match set.
    // "" / "any" → ignore has_phone in listContactIdsMatching (applyHasPhone: false anyway).
    has_phone: "",
  });
}

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    console.log("[api/campaigns/preview] query params", rawParams);

    const manualIds = parseCsvParam(request, "contact_ids");
    const f = filterFromSearchParams(request);
    console.log("[api/campaigns/preview] parsed filter", f);
    const hasFilter = contactFilterHasCriteria(f);

    if (!manualIds.length && !hasFilter) {
      return NextResponse.json({
        count: null,
        with_phone: null,
        without_phone: null,
        manual_count: 0,
      });
    }

    let filterIds: string[] = [];
    if (hasFilter) {
      const { ids, error: idErr, match_total } = await listContactIdsMatching(supabase, f, {
        applyHasPhone: false,
      });
      if (idErr) {
        console.error("[api/campaigns/preview] listContactIdsMatching error", {
          error: idErr,
          filter: f,
          match_total,
        });
        return NextResponse.json({ error: idErr }, { status: 400 });
      }
      filterIds = ids;
    }

    const unionIds = [...new Set([...filterIds, ...manualIds])];
    const { with_phone, without_phone, error: phoneErr } = await countPhonesForContactIds(
      supabase,
      unionIds,
    );
    if (phoneErr) {
      console.error("[api/campaigns/preview] countPhonesForContactIds error", phoneErr);
      return NextResponse.json({ error: phoneErr }, { status: 400 });
    }

    return NextResponse.json({
      count: with_phone + without_phone,
      with_phone,
      without_phone,
      manual_count: manualIds.length,
      filter_count: filterIds.length,
      from_ids: manualIds.length > 0 && !hasFilter,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Σφάλμα";
    console.error("[api/campaigns/preview]", message, e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}