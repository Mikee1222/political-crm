import Papa from "papaparse";
import * as XLSX from "xlsx";
import { storeAlexandraExport } from "@/lib/alexandra-storage";

export function rowsFromData(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((r) => r != null && typeof r === "object" && !Array.isArray(r))
    .map((r) => r as Record<string, unknown>);
}

function isAoaInput(
  data: unknown,
): data is { headers: string[]; rows: unknown[][]; sheetName?: string } | { aoa: unknown[][]; sheetName?: string } {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as { headers?: unknown; rows?: unknown; aoa?: unknown };
  if (Array.isArray(d.aoa)) return true;
  return Array.isArray(d.headers) && Array.isArray(d.rows);
}

function safeFilename(name: string, ext: string): string {
  const base = name.replace(/[^\w.\- ()\u0370-\u03FF\u1F00-\u1FFF]+/g, "_").slice(0, 160) || "export";
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
}

function computeColWidths(headers: string[], rows: unknown[][], min = 10, max = 48): { wch: number }[] {
  return headers.map((h, i) => {
    let w = h.length;
    for (const row of rows.slice(0, 50)) {
      const cell = row[i];
      w = Math.max(w, String(cell ?? "").length);
    }
    return { wch: Math.min(max, Math.max(min, w + 2)) };
  });
}

export async function buildAlexandraExcel(
  userId: string,
  data: unknown,
  filename: string,
  options?: { sheetName?: string },
): Promise<{ path: string; download_url: string }> {
  const wb = XLSX.utils.book_new();
  let ws: XLSX.WorkSheet;
  let sheetName = options?.sheetName ?? "Data";

  if (isAoaInput(data)) {
    let aoa: unknown[][];
    if ("aoa" in data) {
      aoa = data.aoa;
    } else {
      aoa = [data.headers, ...data.rows];
    }
    ws = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [["κενό"]]);
    ws["!cols"] = computeColWidths(
      (aoa[0] ?? []).map(String),
      aoa.slice(1) as unknown[][],
    );
    if ("headers" in data && data.headers.length) {
      ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    } else if (aoa.length > 1) {
      const headerIdx = aoa.findIndex((row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim()));
      if (headerIdx >= 0) {
        ws["!freeze"] = {
          xSplit: 0,
          ySplit: headerIdx + 1,
          topLeftCell: `A${headerIdx + 2}`,
          activePane: "bottomLeft",
          state: "frozen",
        };
      }
    }
    sheetName = data.sheetName ?? sheetName;
  } else {
    const rows = rowsFromData(data);
    ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "κενό" }]);
    const keys = rows.length ? Object.keys(rows[0]!) : ["note"];
    ws["!cols"] = computeColWidths(keys, rows.map((r) => keys.map((k) => r[k])));
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return storeAlexandraExport(
    userId,
    safeFilename(filename, ".xlsx"),
    buf,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

export async function buildAlexandraCsv(
  userId: string,
  data: unknown,
  filename: string,
  options?: { bom?: boolean },
): Promise<{ path: string; download_url: string }> {
  const useBom = options?.bom !== false;
  let csv: string;

  if (isAoaInput(data)) {
    const aoa = "aoa" in data ? data.aoa : [data.headers, ...data.rows];
    csv = Papa.unparse(aoa);
  } else {
    const rows = rowsFromData(data);
    csv = rows.length ? Papa.unparse(rows) : "";
  }

  const prefix = useBom ? "\uFEFF" : "";
  const buf = Buffer.from(prefix + csv, "utf-8");
  return storeAlexandraExport(userId, safeFilename(filename, ".csv"), buf, "text/csv; charset=utf-8");
}

/** Build CSV/Excel from headers + row matrix (used by export_contacts). */
export async function buildAlexandraExportMatrix(
  userId: string,
  headers: string[],
  rows: string[][],
  filename: string,
  format: "csv" | "excel",
  sheetName = "Επαφές",
): Promise<{ path: string; download_url: string; format: string }> {
  const payload = { headers, rows, sheetName };
  if (format === "csv") {
    const stored = await buildAlexandraCsv(userId, payload, filename, { bom: true });
    return { ...stored, format: "CSV" };
  }
  const stored = await buildAlexandraExcel(userId, payload, filename, { sheetName });
  return { ...stored, format: "Excel" };
}
