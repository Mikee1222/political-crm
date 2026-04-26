import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { combinedMediaSearch } from "@/lib/media-search";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { user, profile } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
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
