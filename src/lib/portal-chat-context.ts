import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";

type NewsRow = { title: string; slug: string; excerpt: string | null; category: string | null };

function excerptOneLine(ex: string | null, max = 220) {
  if (!ex) return "";
  const t = ex.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function formatNewsBlock(rows: NewsRow[]): string {
  return (
    "\n\nΝΕΑ/ΠΡΟΣΦΑΤΑ (από news_posts· χρησιμοποίησε ΜΟΝΟ αυτούς τους τίτλους/περίληψη όταν σχετίζονται, χωρίς επινόηση, με σύνδεσμο /portal/news/SLUG):\n" +
    rows
      .map(
        (p) =>
          `• «${p.title}» [${p.category || "Νέα"}] /portal/news/${p.slug} — ${excerptOneLine(p.excerpt)}`,
      )
      .join("\n")
  );
}

/** Fetches published news for RAG: recent list + optional ilike when user message has a 4+ char token. */
export async function buildPortalChatNewsContext(userMessage: string): Promise<string> {
  const supabase = getPortalServiceOrAnon();
  const { data: recent, error: e1 } = await supabase
    .from("news_posts")
    .select("title, slug, excerpt, category, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(8);
  if (e1) {
    console.error("[portal chat news] recent", e1);
  }
  const list = (recent ?? []) as NewsRow[];
  const term = userMessage
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .find((w) => w.length >= 4);
  if (term) {
    const { data: hit, error: e2 } = await supabase
      .from("news_posts")
      .select("title, slug, excerpt, category, published_at")
      .eq("published", true)
      .or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(6);
    if (e2) {
      console.error("[portal chat news] search", e2);
    } else if (hit?.length) {
      const by = new Map<string, NewsRow>();
      for (const r of hit as NewsRow[]) {
        by.set(r.slug, r);
      }
      for (const r of list) {
        if (!by.has(r.slug)) by.set(r.slug, r);
      }
      return formatNewsBlock([...by.values()].slice(0, 10));
    }
  }
  if (!list.length) return "";
  return formatNewsBlock(list);
}
