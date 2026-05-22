import * as cheerio from "cheerio";

const MAX_ITEMS = 12;

async function fetchRssItems(query: string): Promise<Array<{ title: string; link: string; pubDate: string }>> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=el&gl=GR&ceid=GR:el`;
  const res = await fetch(url, {
    headers: { "User-Agent": "KaragkounisCRM-Alexandra/1.0" },
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: Array<{ title: string; link: string; pubDate: string }> = [];
  $("item").each((_, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const title = $(el).find("title").text().trim();
    const link = $(el).find("link").text().trim();
    const pubDate = $(el).find("pubDate").text().trim();
    if (title) items.push({ title, link, pubDate });
  });
  return items;
}

export async function fetchNews(query: string): Promise<Record<string, unknown>> {
  const q = query.trim();
  if (!q) throw new Error("Χρειάζεται όρος αναζήτησης");
  const items = await fetchRssItems(q);
  return { ok: true, query: q, count: items.length, items };
}

export async function fetchSports(sport: string, query: string): Promise<Record<string, unknown>> {
  const parts = [sport.trim(), query.trim()].filter(Boolean);
  const q = parts.length ? parts.join(" ") : "αθλητικά αποτελέσματα Ελλάδα";
  const items = await fetchRssItems(q);
  return { ok: true, sport: sport.trim() || null, query: q, count: items.length, items };
}
