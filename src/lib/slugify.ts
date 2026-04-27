/** URL-safe slug for news / portal content (Greek + Latin). */
export function slugifyNews(title: string): string {
  const t = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-\u0370-\u03ff\u1f00-\u1fff]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (t.length >= 8) return t.slice(0, 200);
  return t || "ανακοινωση";
}
