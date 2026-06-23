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

const RELATION_TYPE_OTHER = "other";
const CONTACT_FETCH_BATCH = 1000;

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
  byLastName: Map<string, ContactRow[]>;
  find: (lastName: string, firstName: string) => ContactRow | null;
};

function buildContactLookup(contacts: ContactRow[]): ContactLookup {
  const byLastName = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const k = normalizeGreekNameKey(c.last_name);
    const list = byLastName.get(k) ?? [];
    list.push(c);
    byLastName.set(k, list);
  }

  function find(lastName: string, firstName: string): ContactRow | null {
    const nl = normalizeGreekNameKey(lastName);
    const nf = normalizeGreekNameKey(firstName);
    const candidates = byLastName.get(nl) ?? [];

    const exact = candidates.filter((c) => normalizeGreekNameKey(c.first_name) === nf);
    if (exact.length === 1) return exact[0]!;
    if (exact.length > 1) return exact[0]!;

    if (nf.length >= 2) {
      const prefixed = candidates.filter((c) => normalizeGreekNameKey(c.first_name).startsWith(nf));
      if (prefixed.length >= 1) return prefixed[0]!;
    }

    return null;
  }

  return { byLastName, find };
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

async function debugSampleNotFound(
  supabase: SupabaseClient,
  lookup: ContactLookup,
  samples: Array<{ lastName: string; firstName: string }>,
): Promise<void> {
  console.log("\n--- Debug: first failed main-contact lookups ---");
  for (const s of samples) {
    const nl = normalizeGreekNameKey(s.lastName);
    const nf = normalizeGreekNameKey(s.firstName);
    console.log({
      excel_last: s.lastName,
      excel_first: s.firstName,
      norm_last: nl,
      norm_first: nf,
      lookup_hit: lookup.find(s.lastName, s.firstName)?.id ?? null,
    });

    const { data: byLast } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .ilike("last_name", s.lastName)
      .limit(3);
    console.log("  DB ilike last_name:", byLast ?? []);

    const { data: byFirst } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .ilike("first_name", `${s.firstName}%`)
      .limit(3);
    console.log("  DB ilike first_name prefix:", byFirst ?? []);
  }
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
  console.log(`Sheet "${sheetName}": ${rawRows.length} rows → ${uniqueRows.length} unique persons`);

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Fetching all contacts from Supabase…");
  const contacts = await fetchAllContacts(supabase);
  console.log(`Loaded ${contacts.length} contacts`);
  const lookup = buildContactLookup(contacts);

  const { data: existingRels, error: relErr } = await supabase
    .from("contact_relations")
    .select("contact_id_1, contact_id_2");
  if (relErr) throw new Error(relErr.message);

  const existingPairs = new Set(
    (existingRels ?? []).map(
      (r) =>
        `${(r as { contact_id_1: string; contact_id_2: string }).contact_id_1}|${(r as { contact_id_1: string; contact_id_2: string }).contact_id_2}`,
    ),
  );

  let processedPersons = 0;
  let matchedMainContacts = 0;
  let wouldInsertRelations = 0;
  let insertedRelations = 0;
  let skippedNotFound = 0;
  let skippedExisting = 0;
  let skippedSelf = 0;
  let skippedBadName = 0;
  let skippedTrivial = 0;

  const failedMainSamples: Array<{ lastName: string; firstName: string }> = [];
  const successSamples: string[] = [];

  for (const row of uniqueRows) {
    const lastName = cell(row, "Επώνυμο", "επωνυμο", "last_name");
    const firstName = cell(row, "Όνομα", "ονομα", "first_name");
    const relationsRaw = cell(row, "Συσχετίσεις", "συσχετίσεις", "συσχετισεις");

    if (!lastName || !firstName) continue;
    if (isTrivialRelationsCell(relationsRaw)) {
      skippedTrivial += 1;
      continue;
    }

    processedPersons += 1;
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

      const { error: insErr } = await supabase.from("contact_relations").insert({
        contact_id_1,
        contact_id_2,
        relation_type: RELATION_TYPE_OTHER,
      });

      if (insErr) {
        if (insErr.code === "23505") {
          skippedExisting += 1;
          existingPairs.add(pairKey);
          continue;
        }
        throw new Error(`Insert failed: ${insErr.message}`);
      }

      existingPairs.add(pairKey);
      insertedRelations += 1;
    }
  }

  if (failedMainSamples.length) {
    await debugSampleNotFound(supabase, lookup, failedMainSamples);
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
