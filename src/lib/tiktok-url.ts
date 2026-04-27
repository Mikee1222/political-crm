/** Parse TikTok video id from a video URL (path segment after /video/). */
export function getTiktokVideoIdFromUrl(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  const m = s.match(/\/video\/(\d+)/);
  if (m?.[1]) return m[1];
  try {
    const u = new URL(s);
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("video");
    if (i >= 0 && parts[i + 1] && /^\d+$/.test(parts[i + 1]!)) {
      return parts[i + 1]!;
    }
    const last = parts[parts.length - 1];
    if (last && /^\d+$/.test(last)) return last;
  } catch {
    return null;
  }
  return null;
}

/** True if the URL may need a redirect to resolve the numeric video id. */
export function isTiktokUrlLikelyShort(url: string): boolean {
  const s = url.trim();
  if (!s) return false;
  if (getTiktokVideoIdFromUrl(s)) return false;
  try {
    const u = new URL(s);
    const h = u.hostname.toLowerCase();
    if (h === "vm.tiktok.com" || h === "vt.tiktok.com" || h === "m.tiktok.com") return true;
    if (h === "t.tiktok.com") return true;
    if ((h === "www.tiktok.com" || h === "tiktok.com") && /^\/t\//.test(u.pathname)) return true;
  } catch {
    return false;
  }
  return false;
}
