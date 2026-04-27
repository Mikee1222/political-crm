import { NextResponse } from "next/server";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

type OembedTiktok = {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
};

async function fetchOembedMeta(url: string): Promise<Partial<OembedTiktok> | null> {
  const oembed = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(oembed, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  const j = (await res.json()) as OembedTiktok;
  return j;
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
    const items: {
      id: string;
      url: string;
      thumbnailUrl: string | null;
      title: string | null;
      authorName: string | null;
    }[] = [];
    for (const r of list) {
      const url = String(r.url ?? "").trim();
      if (!url) continue;
      // eslint-disable-next-line no-await-in-loop
      const meta = await fetchOembedMeta(url);
      if (meta) {
        items.push({
          id: r.id,
          url,
          thumbnailUrl: meta.thumbnail_url ?? null,
          title: meta.title ?? null,
          authorName: meta.author_name ?? null,
        });
      } else {
        items.push({ id: r.id, url, thumbnailUrl: null, title: null, authorName: null });
      }
    }
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[api/portal/social/tiktok GET]", e);
    return nextJsonError();
  }
}
