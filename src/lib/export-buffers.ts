import JSZip from "jszip";
import * as XLSX from "xlsx";
import { createServiceClient } from "@/lib/supabase/admin";

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const lines = [keys.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      keys
        .map((k) => {
          const v = r[k];
          if (v === null || v === undefined) return "";
          if (typeof v === "object") return csvEscape(JSON.stringify(v));
          return csvEscape(String(v));
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

export async function buildContactsXlsxBuffer(): Promise<Buffer> {
  const admin = createServiceClient();
  const { data, error } = await admin.from("contacts").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "empty" }]);
  XLSX.utils.book_append_sheet(wb, ws, "Contacts");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function buildRequestsXlsxBuffer(): Promise<Buffer> {
  const admin = createServiceClient();
  const { data, error } = await admin.from("requests").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "empty" }]);
  XLSX.utils.book_append_sheet(wb, ws, "Requests");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function buildFullBackupZipBuffer(): Promise<Buffer> {
  const [contacts, requests] = await Promise.all([buildContactsXlsxBuffer(), buildRequestsXlsxBuffer()]);
  const admin = createServiceClient();
  const { data: calls } = await admin.from("calls").select("*");
  const { data: tasks } = await admin.from("tasks").select("*");
  const callsCsv = toCsv((calls ?? []) as Record<string, unknown>[]);
  const tasksCsv = toCsv((tasks ?? []) as Record<string, unknown>[]);
  const zip = new JSZip();
  zip.file("contacts.xlsx", contacts);
  zip.file("requests.xlsx", requests);
  zip.file("calls.csv", callsCsv || "empty\n");
  zip.file("tasks.csv", tasksCsv || "empty\n");
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return out as Buffer;
}
