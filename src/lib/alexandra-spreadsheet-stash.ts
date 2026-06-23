import { createServiceClient } from "@/lib/supabase/admin";
import { chunkArray, IMPORT_CHUNK_SIZE } from "@/lib/chunked-contact-import";

/** Above this row count, rows are uploaded in chunks instead of inline in /api/ai-assistant body. */
export const SPREADSHEET_ATTACHMENT_ROW_THRESHOLD = 500;
export const SPREADSHEET_UPLOAD_CHUNK_SIZE = IMPORT_CHUNK_SIZE;

const BUCKET = "documents";
const STASH_PREFIX = "alexandra-import-stash";

export type SpreadsheetStashMeta = {
  fileName?: string;
  sheetName?: string;
  contextMunicipality?: string;
  columns?: string[];
  totalRows: number;
  totalChunks: number;
};

function stashDir(userId: string, conversationId: string): string {
  return `${STASH_PREFIX}/${userId}/${conversationId}`;
}

export function spreadsheetNeedsChunkedUpload(rowCount: number): boolean {
  return rowCount > SPREADSHEET_ATTACHMENT_ROW_THRESHOLD;
}

export function chunkSpreadsheetRows<T>(rows: T[]): T[][] {
  return chunkArray(rows, SPREADSHEET_UPLOAD_CHUNK_SIZE);
}

export async function deleteSpreadsheetStash(userId: string, conversationId: string): Promise<void> {
  const admin = createServiceClient();
  const dir = stashDir(userId, conversationId);
  const { data: listed, error: listErr } = await admin.storage.from(BUCKET).list(dir);
  if (listErr || !listed?.length) return;
  const paths = listed.map((f) => `${dir}/${f.name}`);
  await admin.storage.from(BUCKET).remove(paths);
}

export async function writeSpreadsheetStashChunk(
  userId: string,
  conversationId: string,
  chunkIndex: number,
  totalChunks: number,
  rows: Record<string, unknown>[],
  meta?: Partial<SpreadsheetStashMeta>,
): Promise<void> {
  const admin = createServiceClient();
  const dir = stashDir(userId, conversationId);

  if (chunkIndex === 0) {
    await deleteSpreadsheetStash(userId, conversationId);
  }

  const chunkPath = `${dir}/part-${chunkIndex}.json`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(
    chunkPath,
    Buffer.from(JSON.stringify(rows), "utf-8"),
    { contentType: "application/json", upsert: true },
  );
  if (upErr) throw new Error(upErr.message);

  if (chunkIndex === 0) {
    const metaDoc: SpreadsheetStashMeta = {
      fileName: meta?.fileName,
      sheetName: meta?.sheetName,
      contextMunicipality: meta?.contextMunicipality,
      columns: meta?.columns,
      totalRows: meta?.totalRows ?? rows.length,
      totalChunks,
    };
    const { error: metaErr } = await admin.storage.from(BUCKET).upload(
      `${dir}/meta.json`,
      Buffer.from(JSON.stringify(metaDoc), "utf-8"),
      { contentType: "application/json", upsert: true },
    );
    if (metaErr) throw new Error(metaErr.message);
  }
}

export async function loadSpreadsheetStash(
  userId: string,
  conversationId: string,
): Promise<{ rows: Record<string, unknown>[]; meta: SpreadsheetStashMeta } | null> {
  const admin = createServiceClient();
  const dir = stashDir(userId, conversationId);

  const { data: metaBlob, error: metaErr } = await admin.storage.from(BUCKET).download(`${dir}/meta.json`);
  if (metaErr || !metaBlob) return null;

  const meta = JSON.parse(await metaBlob.text()) as SpreadsheetStashMeta;
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < meta.totalChunks; i++) {
    const { data: part, error: partErr } = await admin.storage.from(BUCKET).download(`${dir}/part-${i}.json`);
    if (partErr || !part) {
      throw new Error(`Λείπει τμήμα ${i + 1}/${meta.totalChunks} του import`);
    }
    const chunk = JSON.parse(await part.text()) as Record<string, unknown>[];
    if (!Array.isArray(chunk)) {
      throw new Error(`Άκυρο τμήμα ${i + 1} του import`);
    }
    rows.push(...chunk);
  }

  return { rows, meta };
}
