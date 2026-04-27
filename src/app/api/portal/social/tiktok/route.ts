import { NextResponse } from "next/server";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { nextJsonError } from "@/lib/api-resilience";
import { stripOembedScriptTags } from "@/lib/tiktok-embed";
export const dynamic = "force-dynamic";

async function fetchOembedBlockquoteOnly(url: string): Promise<string | null> {
  const oembed = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(oembed, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  const j = (await res.json()) as { html?: string };
  if (!j.html || typeof j.html !== "string") return null;
  const stripped = stripOembedScriptTags(j.html);
  return stripped || null;
}

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
    const items: { id: string; url: string; blockquoteHtml: string | null }[] = [];
    for (const r of list) {
      const url = String(r.url ?? "").trim();
      if (!url) continue;
      // eslint-disable-next-line no-await-in-loop
      const blockquoteHtml = await fetchOembedBlockquoteOnly(url);
      items.push({ id: r.id, url, blockquoteHtml });
    }
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[api/portal/social/tiktok GET]", e);
    return nextJsonError();
  }
}
