import { describe, expect, it } from "vitest";
import {
  chunkSpreadsheetRows,
  SPREADSHEET_ATTACHMENT_ROW_THRESHOLD,
  SPREADSHEET_UPLOAD_CHUNK_SIZE,
  spreadsheetNeedsChunkedUpload,
} from "@/lib/alexandra-spreadsheet-stash";

describe("alexandra-spreadsheet-stash", () => {
  it("chunks at 200 rows", () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({ n: i }));
    const chunks = chunkSpreadsheetRows(rows);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(SPREADSHEET_UPLOAD_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(SPREADSHEET_UPLOAD_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(50);
  });

  it("requires chunked upload above 500 rows only", () => {
    expect(spreadsheetNeedsChunkedUpload(SPREADSHEET_ATTACHMENT_ROW_THRESHOLD)).toBe(false);
    expect(spreadsheetNeedsChunkedUpload(SPREADSHEET_ATTACHMENT_ROW_THRESHOLD + 1)).toBe(true);
    expect(spreadsheetNeedsChunkedUpload(501)).toBe(true);
  });
});
