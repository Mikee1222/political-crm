/**
 * Scrape Greek nameday calendar from eortologio.net into nameday-recurring.json.
 *
 * Note: eortologio.net serves day pages at ?day=D&month=M (path /M/D returns 404).
 */
import { load } from "cheerio";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "lib", "nameday-recurring.json");

const BASE_URL = "https://www.eortologio.net";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DELAY_MS = 300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function daysInMonth(month) {
  return new Date(2024, month, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(day, month) {
  return `${pad2(day)}/${pad2(month)}`;
}

/** Try ?day=&month= first; fall back to year-based canonical URL. */
function dayUrls(month, day) {
  const urls = [`${BASE_URL}/?day=${day}&month=${month}`];
  urls.push(`${BASE_URL}/year/2026/month/${pad2(month)}/day/${pad2(day)}/${day}_`);
  return urls;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function fetchDayPage(month, day) {
  let lastErr;
  for (const url of dayUrls(month, day)) {
    try {
      return await fetchHtml(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`Fetch failed for ${month}/${day}`);
}

function parseNames(html) {
  const $ = load(html);
  const seen = new Set();
  const names = [];

  $("div.name a[href^='/pote_giortazei/']").each((_, el) => {
    let text = $(el).text().trim();
    text = text.replace(/\s*\*\s*$/, "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    names.push(text);
  });

  return names;
}

async function scrapeDay(month, day) {
  const html = await fetchDayPage(month, day);
  return parseNames(html);
}

async function main() {
  const data = [];
  let totalNames = 0;
  let daysWithNames = 0;

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
        console.warn(`  ⚠ ${formatDate(day, month)}: ${err.message}`);
        data.push({ date: formatDate(day, month), names: [] });
      }
      await sleep(DELAY_MS);
    }
  }

  const payload = { data };
  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 1)}\n`, "utf8");

  console.log("\nDone.");
  console.log(`  Entries: ${data.length}`);
  console.log(`  Days with names: ${daysWithNames}`);
  console.log(`  Total name slots: ${totalNames}`);
  console.log(`  Written: ${OUT_PATH}`);

  const samples = [
    data.find((r) => r.date === "01/01"),
    data.find((r) => r.date === "25/03"),
    data.find((r) => r.date === "08/11"),
  ].filter(Boolean);
  console.log("\nSample days:");
  for (const s of samples) {
    console.log(`  ${s.date}: ${s.names.slice(0, 8).join(", ")}${s.names.length > 8 ? "…" : ""} (${s.names.length} names)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
