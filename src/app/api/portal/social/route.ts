import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase/anon";
import { nextJsonError } from "@/lib/api-resilience";
import { buildFacebookPagePluginUrl } from "@/lib/facebook-page-plugin";
import { stripOembedScriptTags } from "@/lib/tiktok-embed";
export const dynamic = "force-dynamic";

function isTiktokUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    return h === "www.tiktok.com" || h === "tiktok.com" || h === "vm.tiktok.com" || h === "m.tiktok.com";
  } catch {
    return false;
  }
}

function isFacebookPageUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    return h === "www.facebook.com" || h === "facebook.com" || h === "m.facebook.com";
  } catch {
    return false;
  }
}

async function fetchOembedBlockquoteOnly(url: string): Promise<string | null> {
  const oembed = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(oembed, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  const j = (await res.json()) as { html?: string };
  if (!j.html || typeof j.html !== "string") return null;
  const stripped = stripOembedScriptTags(j.html);
  return stripped || null;
}

type Settings = {
  show_tiktok: boolean;
  show_facebook: boolean;
  show_instagram: boolean;
  instagram_follower_label: string | null;
};

export async function GET() {
  try {
    const { data: settingsRow, error: sErr } = await supabaseAnon
      .from("portal_social_settings")
      .select("show_tiktok, show_facebook, show_instagram, instagram_follower_label")
      .eq("id", 1)
      .maybeSingle();
    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 400 });
    }
    const settings: Settings = (settingsRow ?? {
      show_tiktok: true,
      show_facebook: true,
      show_instagram: true,
      instagram_follower_label: null,
    }) as Settings;

    const { data: posts, error: pErr } = await supabaseAnon
      .from("social_posts")
      .select("id, platform, url, sort_order, created_at")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
    const rows = posts ?? [];
    const tiktokRows = rows
      .filter((r) => r.platform === "tiktok" && isTiktokUrl(r.url))
      .slice(0, 3);
    const fbRows = rows
      .filter((r) => r.platform === "facebook" && isFacebookPageUrl(r.url))
      .slice(0, 3);

    const tiktok: { id: string; url: string; blockquoteHtml: string | null }[] = [];
    for (const r of tiktokRows) {
      // eslint-disable-next-line no-await-in-loop
      const blockquoteHtml = isTiktokUrl(r.url) ? await fetchOembedBlockquoteOnly(r.url) : null;
      tiktok.push({ id: r.id, url: r.url, blockquoteHtml });
    }

    const facebook = fbRows.map((r) => ({
      id: r.id,
      url: r.url,
      iframeSrc: buildFacebookPagePluginUrl(r.url),
    }));

    return NextResponse.json({ settings, tiktok, facebook });
  } catch (e) {
    console.error("[api/portal/social GET]", e);
    return nextJsonError();
  }
}
