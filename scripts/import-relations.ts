/**
 * Bulk-import related persons (Σχετικά πρόσωπα) from Excel Συσχετίσεις column.
 *
 * Usage:
 *   npx tsx scripts/import-relations.ts [path/to/file.xlsx]
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/import-relations.ts [path]
 *
 * Defaults to the first .xlsx in data/migration/ when no path is given.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as XLSX from "xlsx";
import {
  parseLevel1RelationNames,
  splitRelatedPersonName,
} from "../src/lib/import-relations-parse";

const RELATION_TYPE_OTHER = "other";

const COMBINING = /\p{M}/gu;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(COMBINING, "");
}

function normalizeGreekNameKey(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function contactNameKey(lastName: string, firstName: string): string {
  return `${normalizeGreekNameKey(lastName)}|${normalizeGreekNameKey(firstName)}`;
}

type ContactRow = { id: string; first_name: string; last_name: string };

function pickContactId(
  index: Map<string, string[]>,
  lastName: string,
  firstName: string,
): string | null {
  const ids = index.get(contactNameKey(lastName, firstName));
  if (!ids?.length) return null;
  return ids[0]!;
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

async function main(): Promise<void> {
  loadEnvFile(join(process.cwd(), ".env.local"));
  loadEnvFile(join(process.cwd(), ".env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const excelPath = resolveExcelPath(process.argv[2]);
  console.log(`Reading: ${excelPath}`);

  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");
  const rows = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[sheetName]!, { defval: "" });
  console.log(`Sheet "${sheetName}": ${rows.length} rows`);

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, first_name, last_name");
  if (contactsErr) throw new Error(contactsErr.message);

  const nameIndex = new Map<string, string[]>();
  for (const c of (contacts ?? []) as ContactRow[]) {
    const k = contactNameKey(c.last_name, c.first_name);
    const list = nameIndex.get(k) ?? [];
    list.push(c.id);
    nameIndex.set(k, list);
  }

  const { data: existingRels, error: relErr } = await supabase
    .from("contact_relations")
    .select("contact_id_1, contact_id_2");
  if (relErr) throw new Error(relErr.message);

  const existingPairs = new Set(
    (existingRels ?? []).map(
      (r) => `${(r as { contact_id_1: string; contact_id_2: string }).contact_id_1}|${(r as { contact_id_1: string; contact_id_2: string }).contact_id_2}`,
    ),
  );

  let processedRows = 0;
  let insertedRelations = 0;
  let skippedNotFound = 0;
  let skippedExisting = 0;
  let skippedSelf = 0;
  let skippedBadName = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const lastName = cell(row, "Επώνυμο", "επωνυμο", "last_name");
    const firstName = cell(row, "Όνομα", "ονομα", "first_name");
    const relationsRaw = cell(row, "Συσχετίσεις", "συσχετίσεις", "συσχετισεις");

    if (!relationsRaw || !lastName || !firstName) continue;

    processedRows += 1;
    const mainId = pickContactId(nameIndex, lastName, firstName);
    if (!mainId) {
      skippedNotFound += 1;
      console.warn(
        `Row ${i + 2}: main contact not found — ${lastName} ${firstName}`,
      );
      continue;
    }

    const relatedNames = parseLevel1RelationNames(relationsRaw);
    if (!relatedNames.length) {
      console.warn(`Row ${i + 2}: could not parse 1ο επίπεδο names from: ${relationsRaw.slice(0, 80)}`);
      continue;
    }

    for (const fullName of relatedNames) {
      const parsed = splitRelatedPersonName(fullName);
      if (!parsed) {
        skippedBadName += 1;
        console.warn(`Row ${i + 2}: invalid related name "${fullName}"`);
        continue;
      }

      const relatedId = pickContactId(nameIndex, parsed.last_name, parsed.first_name);
      if (!relatedId) {
        skippedNotFound += 1;
        console.warn(
          `Row ${i + 2}: related not found — ${parsed.last_name} ${parsed.first_name} (from "${fullName}")`,
        );
        continue;
      }

      if (relatedId === mainId) {
        skippedSelf += 1;
        continue;
      }

      const [contact_id_1, contact_id_2] = orderedPair(mainId, relatedId);
      const pairKey = `${contact_id_1}|${contact_id_2}`;
      if (existingPairs.has(pairKey)) {
        skippedExisting += 1;
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
        throw new Error(`Insert failed row ${i + 2}: ${insErr.message}`);
      }

      existingPairs.add(pairKey);
      insertedRelations += 1;
    }
  }

  const skippedTotal = skippedNotFound + skippedExisting + skippedSelf + skippedBadName;
  console.log("\n--- Summary ---");
  console.log(`Processed rows (with Συσχετίσεις + name): ${processedRows}`);
  console.log(`Inserted relations: ${insertedRelations}`);
  console.log(`Skipped (not found): ${skippedNotFound}`);
  console.log(`Skipped (already exists): ${skippedExisting}`);
  console.log(`Skipped (self-link): ${skippedSelf}`);
  console.log(`Skipped (bad name format): ${skippedBadName}`);
  console.log(`Skipped total: ${skippedTotal}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
