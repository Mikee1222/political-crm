import { NextResponse } from "next/server";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { nextJsonError } from "@/lib/api-resilience";
import { getTiktokVideoIdFromUrl } from "@/lib/tiktok-url";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getPortalServiceOrAnon();
    const { data: rows, error } = await supabase
      .from("social_posts")
      .select("id, url, sort_order, created_at")
      .eq("platform", "tiktok")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(3);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const list = rows ?? [];
    const items: { id: string; url: string; videoId: string | null }[] = [];
    for (const r of list) {
      const url = String(r.url ?? "").trim();
      if (!url) continue;
      const videoId = getTiktokVideoIdFromUrl(url);
      items.push({ id: r.id, url, videoId });
    }
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[api/portal/social/tiktok GET]", e);
    return nextJsonError();
  }
}
