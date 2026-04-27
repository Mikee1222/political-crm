/** Build Facebook Page Plugin embed URL (timeline tab, 340×500). */
export function buildFacebookPagePluginUrl(pageOrShareUrl: string): string {
  const u = new URL("https://www.facebook.com/plugins/page.php");
  u.searchParams.set("href", pageOrShareUrl.trim());
  u.searchParams.set("tabs", "timeline");
  u.searchParams.set("width", "340");
  u.searchParams.set("height", "500");
  u.searchParams.set("small_header", "false");
  u.searchParams.set("adapt_container_width", "true");
  u.searchParams.set("hide_cover", "false");
  u.searchParams.set("show_facepile", "true");
  u.searchParams.set("appId", "");
  return u.toString();
}
