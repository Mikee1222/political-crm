import { anthropicComplete } from "@/lib/anthropic-once";
import { SUMMARY_MODEL } from "@/lib/ai-summary";
import { fetchNews } from "@/lib/alexandra-news";
import { combinedMediaSearch, type MediaResult } from "@/lib/media-search";

export type PoliticalResearchType =
  | "news"
  | "statements"
  | "votes"
  | "comparison"
  | "local_impact"
  | "social_media"
  | "full_profile";

export type PoliticalTimeRange = "today" | "week" | "month" | "all";

export type PoliticalResearchInput = {
  subject: string;
  research_type: PoliticalResearchType;
  time_range?: PoliticalTimeRange;
  compare_with_kostas?: boolean;
};

type NewsItem = { title: string; link: string; pubDate: string; source?: string; snippet?: string };

const KOSTAS_ND_CONTEXT = `Κώστας Καραγκούνης — βουλευτής Νέας Δημοκρατίας, Αιτωλοακαρνανία.
Γνωστές γενικές θέσεις ΝΔ/Καραγκούνη: υποστήριξη κυβερνητικής πολιτικής, ανάπτυξη περιφέρειας, υποδομές, αγροτική ανάπτυξη, τουρισμός, προστασία περιβάλλοντος (Μεσολόγγι, λιμνοθάλασσες), τοπική ανάπτυξη Αιτωλοακαρνανίας, σύγχρονο κράτος, δημόσια ασφάλεια, υγεία, παιδεία.`;

function timeSuffix(range: PoliticalTimeRange): string {
  switch (range) {
    case "today":
      return " σήμερα";
    case "week":
      return " εβδομάδα";
    case "month":
      return " μήνας";
    default:
      return "";
  }
}

/** Build 3–5 Google News / web queries from research parameters. */
export function buildPoliticalResearchQueries(input: PoliticalResearchInput): string[] {
  const subject = input.subject.trim();
  const range = input.time_range ?? "week";
  const ts = timeSuffix(range);
  const queries: string[] = [];

  switch (input.research_type) {
    case "news":
      queries.push(`${subject} νέα${ts}`, `${subject} ειδήσεις Ελλάδα`, `${subject} πολιτική`);
      break;
    case "statements":
      queries.push(`${subject} δηλώσεις`, `${subject} συνέντευξη`, `${subject} δήλωση βουλή`);
      break;
    case "votes":
      queries.push(`${subject} ψηφοφορία βουλή`, `${subject} νομοσχέδιο ψήφος`, `${subject} κοινοβούλιο`);
      break;
    case "comparison":
      queries.push(`${subject} θέσεις`, `Καραγκούνης ${subject} σύγκριση`, `${subject} Νέα Δημοκρατία`);
      break;
    case "local_impact":
      queries.push(`${subject} Αιτωλοακαρνανία`, `${subject} Αγρίνιο Μεσολόγγι`, `${subject} τοπικά νέα`);
      break;
    case "social_media":
      queries.push(`${subject} twitter`, `${subject} facebook δήλωση`, `${subject} social media`);
      break;
    case "full_profile":
      queries.push(`${subject} βουλευτής`, `${subject} δηλώσεις${ts}`, `${subject} ψηφοφορία βουλή`, `${subject} Αιτωλοακαρνανία`, `${subject} νέα`);
      break;
  }

  if (range === "today" && !queries.some((q) => q.includes("σήμερα"))) {
    queries.push(`${subject} σήμερα`);
  }
  if (range === "week" && input.research_type !== "full_profile") {
    queries.push(`${subject} τελευταία εβδομάδα`);
  }

  return [...new Set(queries)].slice(0, 5);
}

function mediaToNewsItem(r: MediaResult): NewsItem {
  return {
    title: r.title,
    link: r.link,
    pubDate: r.date,
    source: r.source,
    snippet: r.snippet,
  };
}

export function greekDateLabelAthens(date = new Date()): string {
  return date.toLocaleDateString("el-GR", {
    timeZone: "Europe/Athens",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Queries for the daily political briefing (8–10 searches). */
export function buildPoliticalDailyBriefingQueries(focus?: string): string[] {
  const date = greekDateLabelAthens();
  const queries = [
    `${date} Αιτωλοακαρνανία νέα`,
    `${date} βουλή ψηφοφορία νόμος`,
    `Καραγκούνης ${date}`,
    `ΣΥΡΙΖΑ Αιτωλοακαρνανία ${date}`,
    `ΠΑΣΟΚ Αιτωλοακαρνανία ${date}`,
    `Αγρίνιο Μεσολόγγι νέα ${date}`,
    `Νέα Δημοκρατία δηλώσεις ${date}`,
    focus?.trim() ? `${focus.trim()} ${date}` : "αντιπολίτευση βουλευτές δηλώσεις",
  ];
  return [...new Set(queries)];
}

export async function searchQuery(query: string, useMediaSearch: boolean): Promise<{ query: string; items: NewsItem[] }> {
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  const add = (list: NewsItem[]) => {
    for (const it of list) {
      const key = it.link || it.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  };

  try {
    const rss = await fetchNews(query);
    const rssItems = (rss.items as Array<{ title: string; link: string; pubDate: string }> | undefined) ?? [];
    add(rssItems.map((i) => ({ title: i.title, link: i.link, pubDate: i.pubDate })));
  } catch {
    /* RSS may fail for one query */
  }

  if (useMediaSearch) {
    try {
      const media = await combinedMediaSearch(query);
      add(media.map(mediaToNewsItem));
    } catch {
      /* optional enrichment */
    }
  }

  return { query, items: items.slice(0, 15) };
}

export async function runPoliticalResearch(
  input: PoliticalResearchInput,
  opts?: { isManager?: boolean },
): Promise<Record<string, unknown>> {
  const subject = input.subject.trim();
  if (!subject) {
    return { error: "Χρειάζεται subject (όνομα βουλευτή, κόμματος ή θέμα)" };
  }

  const researchType = input.research_type;
  if (!researchType) {
    return { error: "Χρειάζεται research_type" };
  }

  const timeRange = input.time_range ?? "week";
  const compareWithKostas = input.compare_with_kostas === true;
  const queries = buildPoliticalResearchQueries({
    subject,
    research_type: researchType,
    time_range: timeRange,
    compare_with_kostas: compareWithKostas,
  });

  const useMediaSearch = opts?.isManager === true;
  const searchResults = await Promise.all(queries.map((q) => searchQuery(q, useMediaSearch)));

  const totalItems = searchResults.reduce((n, r) => n + r.items.length, 0);
  const rawFindings = searchResults
    .map((r) => ({
      query: r.query,
      count: r.items.length,
      items: r.items.slice(0, 8),
    }))
    .filter((r) => r.count > 0);

  const findingsBlock = rawFindings
    .map(
      (r) =>
        `### Αναζήτηση: «${r.query}» (${r.count} αποτελέσματα)\n` +
        r.items.map((i) => `- ${i.title} | ${i.pubDate} | ${i.link}${i.snippet ? `\n  ${i.snippet.slice(0, 200)}` : ""}`).join("\n"),
    )
    .join("\n\n");

  const sys = `Είσαι πολιτικός αναλυτής για τον βουλευτή Κώστα Καραγκούνη (ΝΔ, Αιτωλοακαρνανία).
Σύνθεσε αναλυτική αναφορά στα Ελληνικά από τα παρακάτω αποτελέσματα RSS/Google News.
Δομή αναφοράς:
1. **Σύνοψη** (2-3 προτάσεις)
2. **Κύρια ευρήματα** — τι είπε/έγινε, πότε, πού, πολιτική σημασία
3. **Αντιφάσεις ή αλλαγές θέσεων** (αν υπάρχουν, αλλιώς «δεν εντοπίστηκαν»)
4. **Προτάσεις αξιοποίησης για τον Κώστα** — συγκεκριμένες, πρακτικές
${compareWithKostas ? "5. **Σύγκριση με Καραγκούνη/ΝΔ** — συγκρίνε θέσεις όπου σχετικό\n" : ""}
Μην εφευρίσκεις γεγονότα πέρα από τα δεδομένα. Αν τα δεδομένα είναι λίγα, πες το ειλικρινά και πρότεινε επιπλέον αναζητήσεις.
${compareWithKostas ? `\nΓνωστικό πλαίσιο Καραγκούνη/ΝΔ:\n${KOSTAS_ND_CONTEXT}` : ""}`;

  const user = `Θέμα έρευνας: ${subject}
Τύπος: ${researchType}
Χρονικό εύρος: ${timeRange}
Εκτελέστηκαν ${queries.length} αναζητήσεις, συνολικά ${totalItems} αποτελέσματα.

${findingsBlock || "(Δεν βρέθηκαν αποτελέσματα στα RSS — πρότεινε χειροκίνητες αναζητήσεις web_search.)"}`;

  const synthesis = await anthropicComplete(sys, user, { maxTokens: 4096 });
  if (!synthesis.ok) {
    return {
      ok: false,
      error: synthesis.error,
      subject,
      research_type: researchType,
      time_range: timeRange,
      queries_executed: queries,
      suggested_searches: queries,
      raw_findings: rawFindings,
      total_items: totalItems,
    };
  }

  return {
    ok: true,
    subject,
    research_type: researchType,
    time_range: timeRange,
    compare_with_kostas: compareWithKostas,
    queries_executed: queries,
    suggested_searches: queries,
    total_items: totalItems,
    raw_findings: rawFindings,
    report: synthesis.text,
    note:
      totalItems === 0
        ? "Δεν βρέθηκαν RSS αποτελέσματα — χρησιμοποίησε web_search για live αναζήτηση."
        : "Η αναφορά συντίθεται από Google News RSS. Για πλήρη κάλυψη, συμπλήρωσε με web_search.",
  };
}

export async function runPoliticalDailyBriefing(
  input: { focus?: string },
  opts?: { isManager?: boolean },
): Promise<Record<string, unknown>> {
  const focus = input.focus?.trim() || undefined;
  const dateLabel = greekDateLabelAthens();
  const queries = buildPoliticalDailyBriefingQueries(focus);
  const useMediaSearch = opts?.isManager === true;

  const searchResults = await Promise.all(queries.map((q) => searchQuery(q, useMediaSearch)));

  const totalItems = searchResults.reduce((n, r) => n + r.items.length, 0);
  const rawFindings = searchResults
    .map((r) => ({
      query: r.query,
      count: r.items.length,
      items: r.items.slice(0, 6),
    }))
    .filter((r) => r.count > 0);

  const findingsBlock = rawFindings
    .map(
      (r) =>
        `### Αναζήτηση: «${r.query}» (${r.count} αποτελέσματα)\n` +
        r.items.map((i) => `- ${i.title} | ${i.pubDate} | ${i.link}${i.snippet ? `\n  ${i.snippet.slice(0, 180)}` : ""}`).join("\n"),
    )
    .join("\n\n");

  const sys = `Είσαι πολιτικός αναλυτής για τον βουλευτή Κώστα Καραγκούνη (ΝΔ, Αιτωλοακαρνανία).
Σύνθεσε συνοπτικό ημερήσιο briefing στα Ελληνικά από τα παρακάτω αποτελέσματα RSS/Google News.
Χρησιμοποίησε ΑΚΡΙΒΩΣ αυτές τις ενότητες (με emoji):
📰 ΤΥΠΟΣ & ΝΕΑ
🏛️ ΒΟΥΛΗ
👥 ΑΝΤΙΠΑΛΟΙ
📱 SOCIAL MEDIA
💡 ΠΡΟΤΑΣΕΙΣ ΓΙΑ ΚΩΣΤΑ

Μην εφευρίσκεις γεγονότα. Αν δεν υπάρχουν δεδομένα για ενότητα, πες «Δεν εντοπίστηκαν σχετικά νέα».
Κράτα κάθε ενότητα σύντομη (2-4 bullets max).`;

  const user = `Ημερομηνία briefing: ${dateLabel}
${focus ? `Εστίαση: ${focus}\n` : ""}Εκτελέστηκαν ${queries.length} αναζητήσεις, συνολικά ${totalItems} αποτελέσματα.

${findingsBlock || "(Δεν βρέθηκαν αποτελέσματα — σημείωσε ότι χρειάζεται web_search.)"}`;

  const synthesis = await anthropicComplete(sys, user, { model: SUMMARY_MODEL, maxTokens: 400 });
  if (!synthesis.ok) {
    return {
      ok: false,
      error: synthesis.error,
      date: dateLabel,
      focus: focus ?? null,
      queries_executed: queries,
      raw_findings: rawFindings,
      total_items: totalItems,
    };
  }

  return {
    ok: true,
    date: dateLabel,
    focus: focus ?? null,
    queries_executed: queries,
    total_items: totalItems,
    raw_findings: rawFindings,
    report: synthesis.text,
    note:
      totalItems === 0
        ? "Δεν βρέθηκαν RSS αποτελέσματα — χρησιμοποίησε web_search για live αναζήτηση."
        : "Η αναφορά συντίθεται από Google News RSS + media search. Για πλήρη κάλυψη, συμπλήρωσε με web_search.",
  };
}
