import * as XLSX from "xlsx";

export type ParsedSheet = {
  columns: string[];
  /** Full grid as objects keyed by column header (trimmed). */
  rows: Array<Record<string, string | number | null | undefined>>;
  /** First 5 data rows (same shape as `rows`) */
  previewRows: Array<Record<string, string | number | null | undefined>>;
  sheetName: string;
  /** 0-based index in sheet of the row used as column headers. */
  headerRowIndex: number;
};

const HEADER_KEYWORD = /τηλ|κινητ|phone|οικογ|επίθ|ονομ|email|mail|δήμ|municip|περιοχ|αριθ|stather|land/i;

function isMostlyGreek10Digit(s: string): boolean {
  const d = s.replace(/\D/g, "");
  if (d.length < 8) return false;
  if (d.length > 20) return true;
  if (d.length === 10 && (d.startsWith("69") || d.startsWith("2"))) return true;
  return false;
}

/**
 * Picks a header row: prefers rows where several cells look like column titles (Κινητό, Ονομα…), not data.
 */
function pickHeaderRowIndex(matrix: unknown[][], maxScan = 12): number {
  const n = Math.min(maxScan, matrix.length);
  let bestI = 0;
  let bestScore = -Infinity;
  for (let h = 0; h < n; h++) {
    const row = (matrix[h] ?? []) as unknown[];
    const cells = row.map((c) => (c == null ? "" : String(c).trim())).filter((s) => s.length > 0);
    if (cells.length < 2) continue;
    let score = 0;
    for (const cell of cells) {
      if (HEADER_KEYWORD.test(cell)) score += 4;
      if (cell.length < 20) score += 1;
      if (isMostlyGreek10Digit(cell)) score -= 3;
    }
    const dataish = cells.filter((c) => c.split(/\s+/).length > 2 && c.length > 20).length;
    score -= dataish * 2;
    if (score > bestScore) {
      bestScore = score;
      bestI = h;
    }
  }
  return bestI;
}

/**
 * Client-side import: first worksheet, αυτόματη σειρά κεφαλίδων (από αναζήτηση).
 * Normalizes values to string | number for JSON transport.
 */
export function parseSpreadsheetToRows(buf: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
  const name = wb.SheetNames[0] ?? "Sheet1";
  const sheet = wb.Sheets[name];
  if (!sheet) {
    return { columns: [], rows: [], previewRows: [], sheetName: name, headerRowIndex: 0 };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (matrix.length === 0) {
    return { columns: [], rows: [], previewRows: [], sheetName: name, headerRowIndex: 0 };
  }
  const headerIndex = pickHeaderRowIndex(matrix);
  const headerRow = (matrix[headerIndex] ?? []) as unknown[];
  const columns = headerRow.map((c, i) => {
    const t = c != null && String(c).trim() !== "" ? String(c).trim() : `Column_${i + 1}`;
    return t;
  });
  const rows: Array<Record<string, string | number | null | undefined>> = [];
  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const line = (matrix[r] ?? []) as unknown[];
    if (line.every((c) => c == null || String(c).trim() === "")) continue;
    const o: Record<string, string | number | null | undefined> = {};
    for (let c = 0; c < columns.length; c++) {
      const key = columns[c]!;
      const cell = line[c];
      if (cell == null || cell === "") {
        o[key] = "";
        continue;
      }
      if (typeof cell === "number") {
        o[key] = cell;
      } else {
        o[key] = String(cell).trim();
      }
    }
    rows.push(o);
  }
  return {
    columns,
    rows,
    previewRows: rows.slice(0, 5),
    sheetName: name,
    headerRowIndex: headerIndex,
  };
}

export function inferSpreadsheetContextMunicipality(
  fileName?: string,
  sheetName?: string,
  explicit?: string,
): string | undefined {
  const ex = explicit?.trim();
  if (ex) return ex;
  const s = sheetName?.trim();
  if (s && !isGenericSheetName(s)) return s;
  return municipalityHintFromFileBaseName(fileName);
}

function isGenericSheetName(name: string | undefined): boolean {
  if (!name || !name.trim()) return true;
  const t = name.trim();
  if (/^sheet\d*$/i.test(t)) return true;
  if (/^φ[ύυ]λλ[οό]\d*$/i.test(t)) return true;
  return false;
}

function municipalityHintFromFileBaseName(fileName: string | undefined): string | undefined {
  if (!fileName?.trim()) return undefined;
  const base = fileName
    .replace(/^.*[/\\]/, "")
    .replace(/\.[^.]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (base.length < 2 || base.length > 120) return undefined;
  const lower = base.toLowerCase();
  if (/^(export|data|contacts|επαφ|book\d*|new\s*spreadsheet|untitled|timesheet)/i.test(lower)) {
    return undefined;
  }
  return base;
}

export function buildImportPreviewMessage(
  fileName: string,
  columns: string[],
  previewRows: Array<Record<string, string | number | null | undefined>>,
  options?: { headerRowIndex?: number; sheetName?: string },
): string {
  const colLine = columns.join(", ");
  const dataPreview = JSON.stringify(previewRows, null, 0);
  const h =
    options?.headerRowIndex != null
      ? ` Η σειρά επικεφαλίδων (αυτόματη) είναι η γραμμή ${options.headerRowIndex + 1} του φύλλου.`
      : "";
  const s = options?.sheetName?.trim() ? ` Φύλλο: ${options.sheetName}.` : "";
  return `Ανέβασα αρχείο «${fileName}».${s}${h} Στήλες: [${colLine}]. Πρώτες 5 γραμμές δεδομένων: ${dataPreview}. Αν ο τίτλος/όνομα αρχείου υποδηλώνει τόπο (π.χ. δήμος), το χρησιμοποιείς ως municipality+area+toponym. Χωρίς όνομα (first_name) ή κύριο phone δεν γίνεται επαφή. Χρήση full_name: τελευταίο token = first_name, προηγούμενα = last_name. Πολλαπλοί αριθμοί: → phone, phone2, landline. Κάλεσε smart_excel_import με confirmed=false για preview πριν την εισαγωγή.`;
}
