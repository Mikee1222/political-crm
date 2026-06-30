/**
 * Bulk-import related persons (Σχετικά πρόσωπα) from Excel Συσχετίσεις column.
 *
 * Usage:
 *   npx tsx scripts/import-relations.ts [--dry-run] [path/to/file.xlsx]
 *
 * Defaults to the first .xlsx in data/migration/ when no path is given.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as XLSX from "xlsx";
import { normalizeGreekNameKey } from "../src/lib/greek-fuzzy-name";
import {
  isTrivialRelationsCell,
  parseLevel1RelationNames,
  splitRelatedPersonName,
} from "../src/lib/import-relations-parse";

const RELATION_TYPE_OTHER = "Γνωστός με τον/την";
const CONTACT_FETCH_BATCH = 1000;
const INSERT_BATCH_SIZE = 100;
const PROGRESS_EVERY_PERSONS = 500;
const MATCHING_TIMEOUT_MS = 10 * 60 * 1000;

function normHeader(h: string): string {
  return normalizeGreekNameKey(h).replace(/\s+/g, "");
}

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

function parseArgs(argv: string[]): { dryRun: boolean; excelPath?: string } {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const pathArg = args.find((a) => !a.startsWith("--"));
  return { dryRun, excelPath: pathArg };
}

function resolveExcelPath(arg?: string): string {
  if (arg) {
    const p = resolve(arg);
    if (!existsSync(p)) throw new Error(`File not found: ${p}`);
    return p;
  }
  const dir = join(process.cwd(), "data", "migration");
  if (!existsSync(dir)) {
    throw new Error("No data/migration/ directory — pass an Excel path as the first argument.");
  }
  const files = readdirSync(dir)
    .filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith("~$"))
    .sort();
  if (files.length === 0) {
    throw new Error("No .xlsx file in data/migration/ — pass a path as the first argument.");
  }
  if (files.length > 1) {
    console.warn(`Multiple Excel files in data/migration/ — using: ${files[0]}`);
  }
  return join(dir, files[0]!);
}

type ContactRow = { id: string; first_name: string; last_name: string };
type NormalizedContact = ContactRow & { normLast: string; normFirst: string };

type RelationInsertRow = {
  contact_id_1: string;
  contact_id_2: string;
  relation_type: string;
};

function personKey(lastName: string, firstName: string): string {
  return `${normalizeGreekNameKey(lastName)}|${normalizeGreekNameKey(firstName)}`;
}

function orderedPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

type SheetRow = Record<string, unknown>;

function cell(row: SheetRow, ...keys: string[]): string {
  for (const key of Object.keys(row)) {
    const nk = normHeader(key);
    if (keys.some((k) => nk === normHeader(k))) {
      const v = row[key];
      return v == null ? "" : String(v).trim();
    }
  }
  return "";
}

function relationsRichness(raw: string): number {
  if (isTrivialRelationsCell(raw)) return 0;
  return parseLevel1RelationNames(raw).length;
}

/** One row per unique (Επώνυμο, Όνομα), preferring the richest Συσχετίσεις cell. */
function dedupeRowsByPerson(rows: SheetRow[]): SheetRow[] {
  const byPerson = new Map<string, SheetRow>();
  for (const row of rows) {
    const lastName = cell(row, "Επώνυμο", "επωνυμο", "last_name");
    const firstName = cell(row, "Όνομα", "ονομα", "first_name");
    if (!lastName || !firstName) continue;

    const key = personKey(lastName, firstName);
    const existing = byPerson.get(key);
    if (!existing) {
      byPerson.set(key, row);
      continue;
    }
    const rel = cell(row, "Συσχετίσεις", "συσχετίσεις", "συσχετισεις");
    const existingRel = cell(existing, "Συσχετίσεις", "συσχετίσεις", "συσχετισεις");
    if (relationsRichness(rel) > relationsRichness(existingRel)) {
      byPerson.set(key, row);
    }
  }
  return [...byPerson.values()];
}

type ContactLookup = {
  find: (lastName: string, firstName: string) => NormalizedContact | null;
};

function buildContactLookup(contacts: ContactRow[]): ContactLookup {
  const byLastName = new Map<string, NormalizedContact[]>();
  for (const c of contacts) {
    const normLast = normalizeGreekNameKey(c.last_name);
    const normFirst = normalizeGreekNameKey(c.first_name);
    const entry: NormalizedContact = { ...c, normLast, normFirst };
    const list = byLastName.get(normLast) ?? [];
    list.push(entry);
    byLastName.set(normLast, list);
  }

  function find(lastName: string, firstName: string): NormalizedContact | null {
    const nl = normalizeGreekNameKey(lastName);
    const nf = normalizeGreekNameKey(firstName);
    const candidates = byLastName.get(nl) ?? [];

    const exact = candidates.filter((c) => c.normFirst === nf);
    if (exact.length >= 1) return exact[0]!;

    if (nf.length >= 2) {
      const prefixed = candidates.filter((c) => c.normFirst.startsWith(nf));
      if (prefixed.length >= 1) return prefixed[0]!;
    }

    return null;
  }

  return { find };
}

async function fetchAllContacts(supabase: SupabaseClient): Promise<ContactRow[]> {
  const all: ContactRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .order("id", { ascending: true })
      .range(from, from + CONTACT_FETCH_BATCH - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as ContactRow[];
    all.push(...chunk);
    if (chunk.length < CONTACT_FETCH_BATCH) break;
    from += CONTACT_FETCH_BATCH;
  }
  return all;
}

async function fetchExistingRelationPairs(supabase: SupabaseClient): Promise<Set<string>> {
  const pairs = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contact_relations")
      .select("contact_id_1, contact_id_2")
      .order("contact_id_1", { ascending: true })
      .range(from, from + CONTACT_FETCH_BATCH - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Array<{ contact_id_1: string; contact_id_2: string }>;
    for (const r of chunk) {
      pairs.add(`${r.contact_id_1}|${r.contact_id_2}`);
    }
    if (chunk.length < CONTACT_FETCH_BATCH) break;
    from += CONTACT_FETCH_BATCH;
  }
  return pairs;
}

function logFailedMainSamples(
  lookup: ContactLookup,
  samples: Array<{ lastName: string; firstName: string }>,
): void {
  console.log("\n--- Debug: first failed main-contact lookups (in-memory only) ---");
  for (const s of samples) {
    console.log({
      excel_last: s.lastName,
      excel_first: s.firstName,
      norm_last: normalizeGreekNameKey(s.lastName),
      norm_first: normalizeGreekNameKey(s.firstName),
      lookup_hit: lookup.find(s.lastName, s.firstName)?.id ?? null,
    });
  }
}

function assertMatchingNotTimedOut(startedAt: number, lastProgressAt: number): void {
  const now = Date.now();
  if (now - startedAt > MATCHING_TIMEOUT_MS) {
    throw new Error(
      `Matching exceeded ${MATCHING_TIMEOUT_MS / 1000}s — aborting. All lookups must use the in-memory map (no per-row Supabase queries).`,
    );
  }
  if (now - lastProgressAt > 60_000) {
    throw new Error(
      "No matching progress for 60s — possible hang. Ensure no Supabase queries run inside the person loop.",
    );
  }
}

async function flushRelationInserts(
  supabase: SupabaseClient,
  batch: RelationInsertRow[],
  existingPairs: Set<string>,
): Promise<{ inserted: number; skippedExisting: number }> {
  if (!batch.length) return { inserted: 0, skippedExisting: 0 };

  const { error } = await supabase.from("contact_relations").insert(batch);
  if (!error) {
    for (const row of batch) {
      existingPairs.add(`${row.contact_id_1}|${row.contact_id_2}`);
    }
    return { inserted: batch.length, skippedExisting: 0 };
  }

  if (error.code === "23505") {
    let inserted = 0;
    let skippedExisting = 0;
    for (const row of batch) {
      const pairKey = `${row.contact_id_1}|${row.contact_id_2}`;
      if (existingPairs.has(pairKey)) {
        skippedExisting += 1;
        continue;
      }
      const { error: oneErr } = await supabase.from("contact_relations").insert(row);
      if (oneErr) {
        if (oneErr.code === "23505") {
          skippedExisting += 1;
          existingPairs.add(pairKey);
          continue;
        }
        throw new Error(`Insert failed: ${oneErr.message}`);
      }
      existingPairs.add(pairKey);
      inserted += 1;
    }
    return { inserted, skippedExisting };
  }

  throw new Error(`Batch insert failed: ${error.message}`);
}

async function main(): Promise<void> {
  loadEnvFile(join(process.cwd(), ".env.local"));
  loadEnvFile(join(process.cwd(), ".env"));

  const { dryRun, excelPath: pathArg } = parseArgs(process.argv);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const excelPath = resolveExcelPath(pathArg);
  console.log(`Reading: ${excelPath}`);
  if (dryRun) console.log("DRY RUN — no inserts will be made");

  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");
  const rawRows = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[sheetName]!, { defval: "" });
  const uniqueRows = dedupeRowsByPerson(rawRows);
  const rowsToProcess = uniqueRows.filter((row) => {
    const lastName = cell(row, "Επώνυμο", "επωνυμο", "last_name");
    const firstName = cell(row, "Όνομα", "ονομα", "first_name");
    const relationsRaw = cell(row, "Συσχετίσεις", "συσχετίσεις", "συσχετισεις");
    return Boolean(lastName && firstName && !isTrivialRelationsCell(relationsRaw));
  });
  const skippedTrivial = uniqueRows.length - rowsToProcess.length;
  console.log(
    `Sheet "${sheetName}": ${rawRows.length} rows → ${uniqueRows.length} unique persons → ${rowsToProcess.length} with relations`,
  );

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Fetching all contacts from Supabase…");
  const contacts = await fetchAllContacts(supabase);
  console.log(`Loaded ${contacts.length} contacts`);
  const lookup = buildContactLookup(contacts);

  console.log("Fetching existing relation pairs…");
  const existingPairs = await fetchExistingRelationPairs(supabase);
  console.log(`Loaded ${existingPairs.size} existing relation pairs`);

  let processedPersons = 0;
  let matchedMainContacts = 0;
  let wouldInsertRelations = 0;
  let insertedRelations = 0;
  let skippedNotFound = 0;
  let skippedExisting = 0;
  let skippedSelf = 0;
  let skippedBadName = 0;

  const failedMainSamples: Array<{ lastName: string; firstName: string }> = [];
  const successSamples: string[] = [];
  const pendingInserts: RelationInsertRow[] = [];

  const matchingStartedAt = Date.now();
  let lastProgressAt = matchingStartedAt;
  console.log(`Matching ${rowsToProcess.length} persons in-memory (no per-row DB queries)…`);

  for (const row of rowsToProcess) {
    assertMatchingNotTimedOut(matchingStartedAt, lastProgressAt);

    const lastName = cell(row, "Επώνυμο", "επωνυμο", "last_name");
    const firstName = cell(row, "Όνομα", "ονομα", "first_name");
    const relationsRaw = cell(row, "Συσχετίσεις", "συσχετίσεις", "συσχετισεις");

    processedPersons += 1;
    if (processedPersons % PROGRESS_EVERY_PERSONS === 0) {
      lastProgressAt = Date.now();
      console.log(
        `  … ${processedPersons}/${rowsToProcess.length} persons | matched ${matchedMainContacts} | pending inserts ${pendingInserts.length}${dryRun ? ` | would insert ${wouldInsertRelations}` : ` | inserted ${insertedRelations}`}`,
      );
    }

    const main = lookup.find(lastName, firstName);
    if (!main) {
      skippedNotFound += 1;
      if (failedMainSamples.length < 5) {
        failedMainSamples.push({ lastName, firstName });
      }
      continue;
    }

    matchedMainContacts += 1;
    const relatedNames = parseLevel1RelationNames(relationsRaw);
    if (!relatedNames.length) continue;

    for (const fullName of relatedNames) {
      const parsed = splitRelatedPersonName(fullName);
      if (!parsed) {
        skippedBadName += 1;
        continue;
      }

      const related = lookup.find(parsed.last_name, parsed.first_name);
      if (!related) {
        skippedNotFound += 1;
        continue;
      }

      if (related.id === main.id) {
        skippedSelf += 1;
        continue;
      }

      const [contact_id_1, contact_id_2] = orderedPair(main.id, related.id);
      const pairKey = `${contact_id_1}|${contact_id_2}`;
      if (existingPairs.has(pairKey)) {
        skippedExisting += 1;
        continue;
      }

      if (successSamples.length < 10) {
        successSamples.push(
          `${main.last_name} ${main.first_name} ↔ ${related.last_name} ${related.first_name}`,
        );
      }

      if (dryRun) {
        wouldInsertRelations += 1;
        existingPairs.add(pairKey);
        continue;
      }

      pendingInserts.push({
        contact_id_1,
        contact_id_2,
        relation_type: RELATION_TYPE_OTHER,
      });

      if (pendingInserts.length >= INSERT_BATCH_SIZE) {
        const batch = pendingInserts.splice(0, INSERT_BATCH_SIZE);
        const result = await flushRelationInserts(supabase, batch, existingPairs);
        insertedRelations += result.inserted;
        skippedExisting += result.skippedExisting;
        lastProgressAt = Date.now();
        console.log(`  … flushed ${result.inserted} relations (${insertedRelations} total inserted)`);
      }
    }
  }

  if (!dryRun && pendingInserts.length > 0) {
    const result = await flushRelationInserts(supabase, pendingInserts.splice(0), existingPairs);
    insertedRelations += result.inserted;
    skippedExisting += result.skippedExisting;
    console.log(`  … flushed final ${result.inserted} relations`);
  }

  if (failedMainSamples.length) {
    logFailedMainSamples(lookup, failedMainSamples);
  }

  if (successSamples.length) {
    console.log("\n--- First successful matches ---");
    for (const s of successSamples) console.log(`  ${s}`);
  }

  console.log("\n--- Summary ---");
  console.log(`Unique persons with Συσχετίσεις: ${processedPersons}`);
  console.log(`Matched main contacts: ${matchedMainContacts}`);
  console.log(`Skipped trivial (bare 1ο επίπεδο): ${skippedTrivial}`);
  if (dryRun) {
    console.log(`Relations that would be inserted: ${wouldInsertRelations}`);
  } else {
    console.log(`Inserted relations: ${insertedRelations}`);
  }
  console.log(`Skipped (not found): ${skippedNotFound}`);
  console.log(`Skipped (already exists): ${skippedExisting}`);
  console.log(`Skipped (self-link): ${skippedSelf}`);
  console.log(`Skipped (bad name format): ${skippedBadName}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
