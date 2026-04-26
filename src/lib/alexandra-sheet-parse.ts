import * as XLSX from "xlsx";

export type ParsedSheet = {
  columns: string[];
  /** Full grid as objects keyed by column header (trimmed). */
  rows: Array<Record<string, string | number | null | undefined>>;
  /** First 5 data rows (same shape as `rows`) */
  previewRows: Array<Record<string, string | number | null | undefined>>;
  sheetName: string;
};

/**
 * Client-side import: first worksheet, row 0 = headers.
 * Normalizes values to string | number for JSON transport.
 */
export function parseSpreadsheetToRows(buf: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: true });
  const name = wb.SheetNames[0] ?? "Sheet1";
  const sheet = wb.Sheets[name];
  if (!sheet) {
    return { columns: [], rows: [], previewRows: [], sheetName: name };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (matrix.length === 0) {
    return { columns: [], rows: [], previewRows: [], sheetName: name };
  }
  const headerRow = (matrix[0] ?? []) as unknown[];
  const columns = headerRow.map((c, i) => {
    const t = c != null && String(c).trim() !== "" ? String(c).trim() : `Column_${i + 1}`;
    return t;
  });
  const rows: Array<Record<string, string | number | null | undefined>> = [];
  for (let r = 1; r < matrix.length; r++) {
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
  };
}

export function buildImportPreviewMessage(
  fileName: string,
  columns: string[],
  previewRows: Array<Record<string, string | number | null | undefined>>,
): string {
  const colLine = columns.join(", ");
  const dataPreview = JSON.stringify(previewRows, null, 0);
  return `Ανέβασα αρχείο Excel με τις εξής στήλες: [${colLine}]. Πρώτες 5 γραμμές: ${dataPreview}. Κάνε mapping σε πεδία επαφών και δημιουργησε τις επαφές.`;
}
