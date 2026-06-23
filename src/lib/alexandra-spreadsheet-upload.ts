import { fetchWithTimeout } from "@/lib/client-fetch";
import { IMPORT_FETCH_TIMEOUT_MS } from "@/lib/chunked-contact-import";
import { chunkSpreadsheetRows } from "@/lib/alexandra-spreadsheet-stash";

export type ClientSpreadsheetUploadPayload = {
  rows: Array<Record<string, unknown>>;
  fileName?: string;
  sheetName?: string;
  contextMunicipality?: string;
  columns?: string[];
};

/** Upload large spreadsheet rows in sequential chunks before calling /api/ai-assistant. */
export async function clientUploadSpreadsheetStash(
  conversationId: string,
  payload: ClientSpreadsheetUploadPayload,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  const chunks = chunkSpreadsheetRows(payload.rows);
  const totalChunks = chunks.length;

  for (let i = 0; i < totalChunks; i++) {
    const res = await fetchWithTimeout("/api/ai-assistant/spreadsheet-stash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        chunkIndex: i,
        totalChunks,
        rows: chunks[i],
        ...(i === 0
          ? {
              totalRows: payload.rows.length,
              fileName: payload.fileName,
              sheetName: payload.sheetName,
              contextMunicipality: payload.contextMunicipality,
              columns: payload.columns,
            }
          : {}),
      }),
      timeoutMs: IMPORT_FETCH_TIMEOUT_MS,
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(j.error || `Αποτυχία αποστολής τμήματος ${i + 1}/${totalChunks}`);
    }
    onProgress?.(i + 1, totalChunks);
  }

  if (totalChunks === 0) {
    throw new Error("Κενό αρχείο");
  }
}

export async function clientDeleteSpreadsheetStash(conversationId: string): Promise<void> {
  await fetchWithTimeout("/api/ai-assistant/spreadsheet-stash", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
    timeoutMs: IMPORT_FETCH_TIMEOUT_MS,
  }).catch(() => undefined);
}
