import { NextRequest, NextResponse } from "next/server";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = getPortalServiceOrAnon();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim();
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
    let q = supabase
      .from("news_posts")
      .select("*")
      .eq("published", true)
      .order("published_at", { ascending: false, nullsFirst: false });
    if (category) {
      q = q.eq("category", category);
    }
    const { data, error } = await q.limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ posts: data ?? [] });
  } catch (e) {
    console.error("[api/portal/news GET]", e);
    return nextJsonError();
  }
}
