import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { combinedMediaSearch } from "@/lib/media-search";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const q = request.nextUrl.searchParams.get("q") ?? "Καραγκούνης";
    const results = await combinedMediaSearch(q);
    return NextResponse.json({ results, query: q });
  } catch (e) {
    console.error("[api/media/search]", e);
    return nextJsonError();
  }
}
