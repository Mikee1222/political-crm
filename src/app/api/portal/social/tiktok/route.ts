import { NextResponse } from "next/server";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { nextJsonError } from "@/lib/api-resilience";
import { getTiktokVideoIdFromUrl, isTiktokUrlLikelyShort } from "@/lib/tiktok-url";

export const dynamic = "force-dynamic";
/** vm.tiktok.com + oEmbed can take a few seconds */
export const maxDuration = 60;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function resolveTiktokRedirectUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.url) return url;
  return res.url;
}

type TiktokOembed = {
  thumbnail_url: string | null;
  title: string | null;
  author_name: string | null;
  author_url: string | null;
};

async function fetchOembedData(videoPageUrl: string): Promise<TiktokOembed | null> {
  try {
    const oembed = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoPageUrl)}`;
    const r = await fetch(oembed, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      thumbnail_url?: string;
      title?: string;
      author_name?: string;
      author_url?: string;
    };
    return {
      thumbnail_url: typeof j.thumbnail_url === "string" && j.thumbnail_url.trim() ? j.thumbnail_url.trim() : null,
      title: typeof j.title === "string" && j.title.trim() ? j.title.trim() : null,
      author_name: typeof j.author_name === "string" && j.author_name.trim() ? j.author_name.trim() : null,
      author_url: typeof j.author_url === "string" && j.author_url.trim() ? j.author_url.trim() : null,
    };
  } catch {
    return null;
  }
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
      videoId: string | null;
      thumbnailUrl: string | null;
      resolvedUrl: string | null;
      oembedTitle: string | null;
      oembedAuthor: string | null;
    }[] = [];

    for (const r of list) {
      const raw = String(r.url ?? "").trim();
      if (!raw) continue;

      let videoId = getTiktokVideoIdFromUrl(raw);
      let resolved = raw;
      if (!videoId) {
        try {
          if (isTiktokUrlLikelyShort(raw) || raw.includes("tiktok.com")) {
            resolved = await resolveTiktokRedirectUrl(raw);
            videoId = getTiktokVideoIdFromUrl(resolved) ?? getTiktokVideoIdFromUrl(raw);
          }
        } catch {
          /* use raw */
        }
      }
      if (!videoId) {
        items.push({
          id: r.id,
          url: raw,
          videoId: null,
          thumbnailUrl: null,
          resolvedUrl: null,
          oembedTitle: null,
          oembedAuthor: null,
        });
        continue;
      }

      const pageForOembed = resolved.includes("/video/") ? resolved : `https://www.tiktok.com/video/${videoId}`;
      const oembed = await fetchOembedData(pageForOembed);

      items.push({
        id: r.id,
        url: raw,
        videoId,
        thumbnailUrl: oembed?.thumbnail_url ?? null,
        resolvedUrl: resolved !== raw ? resolved : null,
        oembedTitle: oembed?.title ?? null,
        oembedAuthor: oembed?.author_name ?? null,
      });
    }
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[api/portal/social/tiktok GET]", e);
    return nextJsonError();
  }
}
