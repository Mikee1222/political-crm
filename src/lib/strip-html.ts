/**
 * Strips HTML tags and decodes common named/numeric HTML entities. Safe for display text.
 * Works in browser and Node (no DOM dependency).
 */
const NAMED: Record<string, string> = {
  amp: "&",
  apos: "\u0027",
  quot: "\u0022",
  nbsp: " ",
  lt: "<",
  gt: ">",
  frasl: "/",
  copy: "©",
  reg: "®",
  euro: "€",
  hellip: "…",
  ndash: "–",
  mdash: "—",
};

function decodeOneEntity(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("#x") || s.startsWith("#X")) {
    const num = parseInt(s.slice(2), 16);
    return Number.isFinite(num) ? String.fromCodePoint(num) : raw;
  }
  if (s.startsWith("#")) {
    const num = parseInt(s.slice(1), 10);
    return Number.isFinite(num) ? String.fromCodePoint(num) : raw;
  }
  return NAMED[s.toLowerCase()] ?? raw;
}

export function decodeHtmlEntities(str: string): string {
  return str.replace(/&([#a-zA-Z0-9]+);/g, (_, e: string) => decodeOneEntity(e));
}

function stripTagBlocks(s: string): string {
  return s
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, " ");
}

function decodeEntitiesRepeated(str: string, max = 4): string {
  let out = str;
  for (let i = 0; i < max; i += 1) {
    const next = decodeHtmlEntities(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

export function stripHtml(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = String(raw);
  if (!s) return "";
  const unscript = stripTagBlocks(s);
  const noTags = unscript.replace(/<[^>]+>/g, " ");
  const decoded = decodeEntitiesRepeated(noTags);
  return decoded.replace(/\s+/g, " ").trim();
}
