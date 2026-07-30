import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import {
  contactFilterHasCriteria,
  countContactsMatching,
  listContactIdsMatching,
  type ContactFilter,
} from "@/lib/contacts-filter-query";
import { nextJsonError } from "@/lib/api-resilience";
import { contactHasAnyCampaignPhone } from "@/lib/campaign-contact-phone";
export const dynamic = "force-dynamic";

function parseGroupIds(request: NextRequest): string[] {
  const collected: string[] = [];
  for (const v of request.nextUrl.searchParams.getAll("group_ids")) {
    collected.push(...v.split(","));
  }
  return [...new Set(collected.map((x) => x.trim()).filter(Boolean))];
}

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const idsParam = request.nextUrl.searchParams.get("contact_ids")?.trim() ?? "";
    if (idsParam) {
      const ids = [...new Set(idsParam.split(",").map((x) => x.trim()).filter(Boolean))];
      if (ids.length === 0) {
        return NextResponse.json({ count: 0, with_phone: 0, without_phone: 0 });
      }
      const { data, error } = await supabase
        .from("contacts")
        .select("id, phone, phone2, landline")
        .in("id", ids.slice(0, 5000));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      let with_phone = 0;
      let without_phone = 0;
      for (const row of (data ?? []) as Array<{
        phone: string | null;
        phone2: string | null;
        landline: string | null;
      }>) {
        if (contactHasAnyCampaignPhone(row)) with_phone += 1;
        else without_phone += 1;
      }
      return NextResponse.json({
        count: with_phone + without_phone,
        with_phone,
        without_phone,
        from_ids: true,
      });
    }

    const groupIds = parseGroupIds(request);
    const f: ContactFilter = {
      call_status: request.nextUrl.searchParams.get("call_status") ?? undefined,
      area: request.nextUrl.searchParams.get("area") ?? undefined,
      municipality: request.nextUrl.searchParams.get("municipality") ?? undefined,
      priority: request.nextUrl.searchParams.get("priority") ?? undefined,
      tag: request.nextUrl.searchParams.get("tag") ?? undefined,
      group_ids: groupIds.length ? groupIds : undefined,
    };

    if (!contactFilterHasCriteria(f)) {
      return NextResponse.json({ count: null, with_phone: null, without_phone: null });
    }

    const { count, error } = await countContactsMatching(supabase, f);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const { ids, error: idErr } = await listContactIdsMatching(supabase, f);
    if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });

    let with_phone = 0;
    let without_phone = 0;
    // Batch fetch phones (Supabase .in limit — chunk)
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error: pErr } = await supabase
        .from("contacts")
        .select("id, phone, phone2, landline")
        .in("id", slice);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
      for (const row of (data ?? []) as Array<{
        phone: string | null;
        phone2: string | null;
        landline: string | null;
      }>) {
        if (contactHasAnyCampaignPhone(row)) with_phone += 1;
        else without_phone += 1;
      }
    }

    return NextResponse.json({
      count: count ?? with_phone + without_phone,
      with_phone,
      without_phone,
    });
  } catch (e) {
    console.error("[api/campaigns/preview]", e);
    return nextJsonError();
  }
}
