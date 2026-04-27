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
