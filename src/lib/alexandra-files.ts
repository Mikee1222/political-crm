import Papa from "papaparse";
import * as XLSX from "xlsx";
import { storeAlexandraExport } from "@/lib/alexandra-storage";

export function rowsFromData(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((r) => r != null && typeof r === "object" && !Array.isArray(r))
    .map((r) => r as Record<string, unknown>);
}

function safeFilename(name: string, ext: string): string {
  const base = name.replace(/[^\w.\- ()\u0370-\u03FF\u1F00-\u1FFF]+/g, "_").slice(0, 160) || "export";
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
}

export async function buildAlexandraExcel(
  userId: string,
  data: unknown,
  filename: string,
): Promise<{ path: string; download_url: string }> {
  const rows = rowsFromData(data);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "κενό" }]);
  XLSX.utils.book_append_sheet(wb, ws, "Data");
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
): Promise<{ path: string; download_url: string }> {
  const rows = rowsFromData(data);
  const csv = rows.length ? Papa.unparse(rows) : "";
  const buf = Buffer.from(csv, "utf-8");
  return storeAlexandraExport(userId, safeFilename(filename, ".csv"), buf, "text/csv; charset=utf-8");
}
