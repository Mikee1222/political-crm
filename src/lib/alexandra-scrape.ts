import * as cheerio from "cheerio";

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 48_000;
const FETCH_MS = 18_000;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (h.startsWith("169.254.")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

export function assertPublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Άκυρο URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Μόνο http/https URLs");
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error("Δεν επιτρέπονται τοπικά ή εσωτερικά URLs");
  }
  return u;
}

export async function scrapePublicUrl(raw: string): Promise<{
  url: string;
  title: string;
  text: string;
  length: number;
}> {
  const u = assertPublicHttpUrl(raw);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  let res: Response;
  try {
    res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "KaragkounisCRM-Alexandra/1.0 (+https://crm.kkaragkounis.com)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(ct) && !ct.includes("xml")) {
    throw new Error(`Μη υποστηριζόμενος τύπος: ${ct.slice(0, 80)}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Το αρχείο είναι πολύ μεγάλο για ανάγνωση");
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  const title = $("title").first().text().trim().slice(0, 300);
  let text = $("body").text().replace(/\s+/g, " ").trim();
  if (!text) text = $.root().text().replace(/\s+/g, " ").trim();
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}…`;
  return { url: u.toString(), title, text, length: text.length };
}
