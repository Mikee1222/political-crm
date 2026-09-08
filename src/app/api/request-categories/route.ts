import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getRequestCategoryCounts,
  loadRequestCategoryMeta,
  mergeCategoryCountsWithMeta,
} from "@/lib/request-category-counts";
import type { RequestCategoryRow } from "@/lib/request-categories";

export const dynamic = "force-dynamic";

/** List request categories for CRM filters / forms (all CRM users). */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;

    // Service client: reliable for dropdowns (user client is fine for request_categories
    // RLS, but counts RPC + consistent meta load should not depend on session quirks).
    const service = createServiceClient();
    let counts;
    try {
      counts = await getRequestCategoryCounts(service);
    } catch (rpcErr) {
      console.warn("[api/request-categories GET] RPC failed, falling back to lookup table", rpcErr);
      const metaByName = await loadRequestCategoryMeta(service);
      counts = [...metaByName.values()].map((m) => ({ name: m.name, request_count: 0 }));
    }

    const metaByName = await loadRequestCategoryMeta(service);
    const merged = mergeCategoryCountsWithMeta(counts, metaByName);
    const items: RequestCategoryRow[] = merged.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      sort_order: m.sort_order,
      created_at: "",
      sla_days: m.sla_days ?? null,
    }));

    return NextResponse.json({
      categories: items.map((c) => c.name),
      items,
    });
  } catch (e) {
    console.error("[api/request-categories GET]", e);
    return nextJsonError();
  }
}
