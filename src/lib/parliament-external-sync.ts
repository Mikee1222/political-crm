import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (compatible; KaragkounisCRM-ParliamentSync/1.0; +https://vouliwatch.gr)";

export const MP_SYNC_URLS = {
  vouliwatch: "https://vouliwatch.gr/mp/karagkoynis-konstantinos",
  hellenicBio:
    "https://www.hellenicparliament.gr/vouleftes/viografika-stoicheia/?MPId=897f098b-6295-48f2-85a2-b3625386a319",
  hellenicActivity:
    "https://www.hellenicparliament.gr/Vouleftes/Drastiriotita-Voulefti-sto-Koinovoulio/?MPId=897f098b-6295-48f2-85a2-b3625386a319",
} as const;

export const KARAGKOUNIS_HOMEPAGE = "https://www.karagkounis.gr/";

export function normalizeTitle(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeMetaEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractGreekDate(text: string): string | null {
  const paren = text.match(/\((\d{2})-(\d{2})-(\d{4})\)/);
  if (paren) {
    return `${paren[3]}-${paren[2]}-${paren[1]}`;
  }
  const paren2 = text.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (paren2) {
    return `${paren2[3]}-${paren2[2]}-${paren2[1]}`;
  }
  return null;
}

function absolutizeHellenic(href: string): string {
  if (href.startsWith("http")) return href;
  return new URL(href, "https://www.hellenicparliament.gr").toString();
}

export type VouliwatchExtraction = {
  /** Meta / OG text — the MP page is a Vite SPA; lists are not in the initial HTML. */
  profileSummary: string;
  pageTitle: string;
};

export function parseVouliwatchHtml(html: string): VouliwatchExtraction {
  const $ = cheerio.load(html);
  const title = ($("title").text() || "").trim();
  const metaDesc = decodeMetaEntities(
    ($('meta[name="description"]').attr("content") || "").trim(),
  );
  const ogDesc = decodeMetaEntities(
    ($('meta[property="og:description"]').attr("content") || "").trim(),
  );
  const profileSummary = (ogDesc.length > metaDesc.length ? ogDesc : metaDesc) || title;
  return { profileSummary, pageTitle: title };
}

export type HellenicBioExtraction = {
  fullName: string;
  roleLine: string;
  districtLine: string;
  contactHtml: string;
  personalHtml: string;
  imageUrl: string | null;
};

export function parseHellenicBiografikaHtml(html: string): HellenicBioExtraction {
  const $ = cheerio.load(html);
  const page = $(".pagecontent, .pagebox .pagecontent, #middlecolumnwide .pagecontent");
  const root = page.length ? page : $("body");
  const h1Texts = root
    .find("h1")
    .toArray()
    .map((e) => $(e).text().replace(/\s+/g, " ").trim());
  const bioIdx = h1Texts.findIndex(
    (t) => t === "Βιογραφικά Στοιχεία" || t.startsWith("Βιογραφικά"),
  );
  const fullName =
    (bioIdx >= 0 && h1Texts[bioIdx + 1] ? h1Texts[bioIdx + 1] : "") ||
    h1Texts.find((t) => /Καραγκ|Κωνσταντ/i.test(t)) ||
    "";
  const h2s = root.find("h2").toArray();
  const roleLine = h2s[0] ? $(h2s[0]).text().replace(/\s+/g, " ").trim() : "";
  const h3s = root.find("h3").toArray();
  const districtLine = h3s[0] ? $(h3s[0]).text().replace(/\s+/g, " ").trim() : "";
  const contactBox = root.find("div.info .container, .box.info .container").first();
  const contactHtml = contactBox.length
    ? contactBox.html() || ""
    : root.find("dl").first().parent().html() || "";
  const personalH2 = root
    .find("h2")
    .filter((_, e) => $(e).text().includes("Προσωπικά"))
    .first();
  let personalHtml = "";
  if (personalH2.length) {
    const dls = personalH2.nextAll("dl").first();
    personalHtml = dls.length ? dls.html() || "" : "";
  }
  const photo = root.find("img.inlinephoto, img[alt][class*='inline'], .pagecontent img").first();
  const src0 = photo.attr("src");
  const imageUrl: string | null = src0 ? absolutizeHellenic(src0) : null;
  return {
    fullName,
    roleLine,
    districtLine,
    contactHtml: contactHtml || "",
    personalHtml: personalHtml || "",
    imageUrl,
  };
}

export type LawRow = { title: string; url: string; date: string | null; kind: "domestic" | "intl" };
export type SpeechRow = { title: string; url: string; date: string | null; docUrl: string | null };
export type ControlLink = { label: string; url: string } | null;

export type HellenicActivityExtraction = {
  speeches: SpeechRow[];
  laws: LawRow[];
  koinElegchos: ControlLink;
  vouliwatchExcerpt: string; // filled by caller; placeholder
};

export function parseHellenicDrastirititaHtml(
  html: string,
  vouliExcerpt: string,
): HellenicActivityExtraction {
  const $ = cheerio.load(html);
  const base = "https://www.hellenicparliament.gr";
  const speeches: SpeechRow[] = [];

  $('a[name="a1"]')
    .next("h1")
    .next("table")
    .find('td a[href*="/Praktika/Synedriaseis"]')
    .each((_, el) => {
      const a = $(el);
      const t = normalizeTitle(a.text());
      if (!t) return;
      const href = a.attr("href");
      if (!href) return;
      const tr = a.closest("tr");
      const docA = tr.find("a[href*='.docx'], a[href*='.doc']").first();
      const docUrl = docA.length ? absolutizeHellenic(docA.attr("href")!) : null;
      const url = absolutizeHellenic(href);
      const date = extractGreekDate(t);
      speeches.push({ title: `Ομιλία Ολομέλειας: ${t}`, url, date, docUrl });
    });

  const laws: LawRow[] = [];
  const pushLaw = (a: ReturnType<typeof $>, kind: "domestic" | "intl") => {
    const t = normalizeTitle(
      a
        .text()
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s+/g, " "),
    );
    if (!t) return;
    const href = a.attr("href");
    if (!href) return;
    const u = href.startsWith("http") ? href : new URL(href, base).toString();
    laws.push({ title: t, url: u, date: extractGreekDate(t), kind });
  };

  $('a[name="a4"]')
    .next("h1")
    .next("ul")
    .find("li a[href*='/Nomothetiko-Ergo/']")
    .each((_, el) => pushLaw($(el), "domestic"));

  $('a[name="a7"]')
    .next("h1")
    .next("ul")
    .find("li a[href*='/Nomothetiko-Ergo/']")
    .each((_, el) => pushLaw($(el), "intl"));

  let koin: ControlLink = null;
  const mLink = $('a#ctl00_ContentPlaceHolder1_mpa_lnkMesa, a[href*="Mesa-Koinovouleutikou-Elegxou"]')
    .filter((_, e) => $(e).text().length > 0)
    .first();
  if (mLink.length) {
    const href = mLink.attr("href");
    if (href) {
      koin = {
        label: normalizeTitle(mLink.text()) || "Μέσα κοιν. ελέγχου (Βουλή)",
        url: new URL(href, base).toString(),
      };
    }
  }

  return { speeches, laws, koinElegchos: koin, vouliwatchExcerpt: vouliExcerpt };
}

export async function fetchText(url: string, timeoutMs = 28000): Promise<string> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
    });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} για ${url}`);
    }
    return await r.text();
  } finally {
    clearTimeout(id);
  }
}
