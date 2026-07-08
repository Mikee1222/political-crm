/**
 * Scrape Greek nameday calendar from eortologio.net → nameday-recurring.json
 * and upsert into Supabase `name_days` (day, month, names text[]).
 *
 * Note: eortologio.net serves day pages at ?day=D&month=M (path /M/D returns 404).
 *
 * Usage: npx tsx scripts/scrape-namedays.ts
 * Flags:
 *   --json-only   skip DB upsert
 *   --db-only     skip scrape; upsert from existing nameday-recurring.json + supplements
 */
import { load } from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expandNamedayVariantNames,
  getNamedaySeedRows,
  type NamedaySeedRow,
} from "../src/lib/namedays";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "src", "lib", "nameday-recurring.json");

const BASE_URL = "https://www.eortologio.net";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DELAY_MS = 350;
const PROGRESS_EVERY = 30;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function daysInMonth(month: number): number {
  return new Date(2024, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(day: number, month: number): string {
  return `${pad2(day)}/${pad2(month)}`;
}

/** Try ?day=&month= first; fall back to year-based canonical URL. */
function dayUrls(month: number, day: number): string[] {
  return [
    `${BASE_URL}/?day=${day}&month=${month}`,
    `${BASE_URL}/year/2026/month/${pad2(month)}/day/${pad2(day)}/${day}_`,
  ];
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function fetchDayPage(month: number, day: number): Promise<string> {
  let lastErr: unknown;
  for (const url of dayUrls(month, day)) {
    try {
      return await fetchHtml(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Fetch failed for ${month}/${day}`);
}

function parseNames(html: string): string[] {
  const $ = load(html);
  const seen = new Set<string>();
  const names: string[] = [];

  $("div.name a[href^='/pote_giortazei/']").each((_, el) => {
    let text = $(el).text().trim();
    text = text.replace(/\s*\*\s*$/, "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    names.push(text);
  });

  return names;
}

async function scrapeDay(month: number, day: number): Promise<string[]> {
  const html = await fetchDayPage(month, day);
  return parseNames(html);
}

async function scrapeAll(): Promise<{ date: string; names: string[] }[]> {
  const data: { date: string; names: string[] }[] = [];
  let totalNames = 0;
  let daysWithNames = 0;
  let scraped = 0;

  for (let month = 1; month <= 12; month++) {
    const maxDay = daysInMonth(month);
    console.log(`Month ${pad2(month)}: scraping days 1–${maxDay}…`);

    for (let day = 1; day <= maxDay; day++) {
      try {
        const names = await scrapeDay(month, day);
        data.push({ date: formatDate(day, month), names });
        if (names.length > 0) daysWithNames++;
        totalNames += names.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  ⚠ ${formatDate(day, month)}: ${msg}`);
        data.push({ date: formatDate(day, month), names: [] });
      }
      scraped++;
      if (scraped % PROGRESS_EVERY === 0) {
        console.log(`  … ${scraped}/366 days (${daysWithNames} with names, ${totalNames} name slots)`);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log("\nScrape done.");
  console.log(`  Entries: ${data.length}`);
  console.log(`  Days with names: ${daysWithNames}`);
  console.log(`  Total name slots: ${totalNames}`);
  return data;
}

async function upsertRows(rows: NamedaySeedRow[]): Promise<void> {
  loadEnvFile(join(ROOT, ".env.local"));
  loadEnvFile(join(ROOT, ".env"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const batch = rows.map((r) => ({
    month: r.month,
    day: r.day,
    names: expandNamedayVariantNames(r.names),
  }));

  const CHUNK = 80;
  let upserted = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const part = batch.slice(i, i + CHUNK);
    const { error } = await supabase.from("name_days").upsert(part, {
      onConflict: "month,day",
    });
    if (error) {
      throw new Error(`Upsert failed at offset ${i}: ${error.message}`);
    }
    upserted += part.length;
    console.log(`  Upserted ${upserted}/${batch.length}`);
  }
}

function sampleJuly8(data: { date: string; names: string[] }[]): void {
  const row = data.find((r) => r.date === "08/07");
  if (!row) {
    console.warn("July 8 missing from scrape output");
    return;
  }
  console.log(`\nJuly 8 sample (${row.names.length} names): ${row.names.join(", ")}`);
  const need = ["Θεόφιλος", "Προκόπιος"];
  for (const n of need) {
    const ok = row.names.some((x) => x.toLowerCase() === n.toLowerCase());
    console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const jsonOnly = args.has("--json-only");
  const dbOnly = args.has("--db-only");

  if (!dbOnly) {
    const data = await scrapeAll();
    writeFileSync(OUT_PATH, `${JSON.stringify({ data }, null, 1)}\n`, "utf8");
    console.log(`  Written: ${OUT_PATH}`);
    sampleJuly8(data);
  } else {
    console.log("Skipping scrape (--db-only); using existing JSON + feast supplements.");
  }

  if (jsonOnly) {
    console.log("Skipping DB upsert (--json-only).");
    return;
  }

  // Prefer merged seed (JSON + feast supplements + variants). After a fresh scrape the
  // JSON on disk is new; getNamedaySeedRows still reads the bundled import, so when we
  // just scraped we upsert from the file we wrote instead.
  let rows: NamedaySeedRow[];
  if (!dbOnly) {
    const raw = JSON.parse(readFileSync(OUT_PATH, "utf8")) as {
      data: { date: string; names: string[] }[];
    };
    rows = raw.data
      .map((r) => {
        const [d, m] = r.date.split("/").map((x) => parseInt(x, 10));
        if (!m || !d) return null;
        return { month: m, day: d, names: r.names };
      })
      .filter((r): r is NamedaySeedRow => r != null && r.names.length > 0);
  } else {
    rows = getNamedaySeedRows();
  }

  console.log(`\nUpserting ${rows.length} days into name_days…`);
  await upsertRows(rows);
  console.log("DB upsert complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
