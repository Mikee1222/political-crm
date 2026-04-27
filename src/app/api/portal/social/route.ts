import { NextResponse } from "next/server";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { nextJsonError } from "@/lib/api-resilience";
import { buildFacebookPagePluginUrl } from "@/lib/facebook-page-plugin";
export const dynamic = "force-dynamic";

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

type Settings = {
  show_tiktok: boolean;
  show_facebook: boolean;
  show_instagram: boolean;
  instagram_follower_label: string | null;
};

export async function GET() {
  try {
    const supabase = getPortalServiceOrAnon();
    const { data: settingsRow, error: sErr } = await supabase
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

    const { data: posts, error: pErr } = await supabase
      .from("social_posts")
      .select("id, platform, url, sort_order, created_at")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
    const rows = posts ?? [];
    const fbRows = rows
      .filter((r) => r.platform === "facebook" && isFacebookPageUrl(r.url))
      .slice(0, 3);

    const facebook = fbRows.map((r) => ({
      id: r.id,
      url: r.url,
      iframeSrc: buildFacebookPagePluginUrl(r.url),
    }));

    return NextResponse.json({ settings, facebook });
  } catch (e) {
    console.error("[api/portal/social GET]", e);
    return nextJsonError();
  }
}
