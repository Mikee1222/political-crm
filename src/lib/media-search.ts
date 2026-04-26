/**
 * Συλλογή αποτελεσμάτων ειδήσεων: Google News RSS + (προαιρετικά) DuckDuckGo instant answer.
 */

export type MediaResult = {
  title: string;
  source: string;
  date: string;
  snippet: string;
  link: string;
};

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\u0022")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function extractRssItems(xml: string): MediaResult[] {
  const items: MediaResult[] = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1] ?? "";
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const l = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block);
    const p = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i.exec(block);
    const d = /<description[^>]*>([\s\S]*?)<\/description>/i.exec(block);
    const s = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(block);
    const title = decodeXml((t?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    const link = decodeXml((l?.[1] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!title || !link) {
      continue;
    }
    const desc = decodeXml((d?.[1] ?? "").replace(/<[^>]+>/g, " ").trim());
    items.push({
      title,
      link,
      date: (p?.[1] ?? "").trim() || "—",
      snippet: desc.slice(0, 500),
      source: (s?.[1] ?? "").replace(/<[^>]+>/g, "").trim() || "Νέα",
    });
  }
  return items;
}

export async function searchNewsForQuery(q: string): Promise<MediaResult[]> {
  const query = String(q ?? "").trim() || "Καραγκούνης";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=el&gl=GR&ceid=GR:el`;
  const res = await fetch(url, { headers: { "User-Agent": "PoliticalCRM/1.0" }, next: { revalidate: 0 } });
  if (!res.ok) {
    return [];
  }
  const xml = await res.text();
  return extractRssItems(xml).slice(0, 20);
}

export async function duckDuckGoInstantTopics(q: string): Promise<MediaResult[]> {
  const query = String(q ?? "").trim();
  if (!query) {
    return [];
  }
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`;
  const res = await fetch(url, { headers: { "User-Agent": "PoliticalCRM/1.0" }, next: { revalidate: 0 } });
  if (!res.ok) {
    return [];
  }
  const j = (await res.json().catch(() => ({}))) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] }>;
  };
  const out: MediaResult[] = [];
  if (j.AbstractText && j.AbstractURL) {
    out.push({
      title: j.Heading || "DuckDuckGo",
      link: j.AbstractURL,
      date: "—",
      snippet: j.AbstractText.slice(0, 500),
      source: "DuckDuckGo",
    });
  }
  const topics = j.RelatedTopics ?? [];
  for (const t of topics.slice(0, 5)) {
    if (t.Text && t.FirstURL) {
      out.push({
        title: t.Text.split(" - ")[0] ?? t.Text,
        link: t.FirstURL,
        date: "—",
        snippet: t.Text,
        source: "Σχετικό",
      });
    } else if (t.Topics) {
      for (const sub of t.Topics) {
        if (sub.Text && sub.FirstURL) {
          out.push({
            title: sub.Text,
            link: sub.FirstURL,
            date: "—",
            snippet: sub.Text,
            source: "Σχετικό",
          });
        }
      }
    }
  }
  return out;
}

export async function combinedMediaSearch(q: string): Promise<MediaResult[]> {
  const [rss, ddg] = await Promise.all([searchNewsForQuery(q), duckDuckGoInstantTopics(q)]);
  const seen = new Set<string>();
  const merged: MediaResult[] = [];
  for (const it of [...rss, ...ddg]) {
    const k = it.link;
    if (!k || seen.has(k)) {
      continue;
    }
    seen.add(k);
    merged.push(it);
  }
  return merged.slice(0, 30);
}
