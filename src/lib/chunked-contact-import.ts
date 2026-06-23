import { fetchWithTimeout } from "@/lib/client-fetch";

export const IMPORT_CHUNK_SIZE = 200;
export const IMPORT_FETCH_TIMEOUT_MS = 130_000;

export type ImportMappedOptions = {
  duplicate_mode?: "skip" | "update";
  skip_duplicates?: boolean;
  update_existing?: boolean;
  dry_run?: boolean;
};

export type ImportMappedChunkResult = {
  inserted?: number;
  updated?: number;
  skipped_duplicates?: number;
  errors?: number;
  errorDetails?: { phone: string; message: string }[];
  duplicates?: unknown[];
  would_insert?: number;
  processed?: number;
  error?: string;
};

export type ChunkedImportAggregate = {
  inserted: number;
  updated: number;
  skipped_duplicates: number;
  errors: number;
  errorDetails: { phone: string; message: string }[];
  chunks_total: number;
  chunks_completed: number;
};

export function chunkArray<T>(arr: T[], size = IMPORT_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function resolveDuplicateMode(opts: ImportMappedOptions): "skip" | "update" {
  if (opts.duplicate_mode === "update" || opts.update_existing === true) return "update";
  if (opts.duplicate_mode === "skip" || opts.skip_duplicates !== false) return "skip";
  return "skip";
}

type ForwardFn = (path: string, init: RequestInit) => Promise<Response>;

/** Server-side sequential chunked POST to import-mapped. */
export async function serverChunkedImportMapped(
  forward: ForwardFn,
  contacts: Record<string, unknown>[],
  options: ImportMappedOptions = {},
  onProgress?: (completed: number, total: number) => void,
): Promise<ChunkedImportAggregate> {
  const chunks = chunkArray(contacts, IMPORT_CHUNK_SIZE);
  const agg: ChunkedImportAggregate = {
    inserted: 0,
    updated: 0,
    skipped_duplicates: 0,
    errors: 0,
    errorDetails: [],
    chunks_total: chunks.length,
    chunks_completed: 0,
  };
  const mode = resolveDuplicateMode(options);
  for (let i = 0; i < chunks.length; i++) {
    const r = await forward("/api/contacts/import-mapped", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contacts: chunks[i],
        duplicate_mode: mode,
        skip_duplicates: mode === "skip",
        update_existing: mode === "update",
        dry_run: options.dry_run === true,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as ImportMappedChunkResult;
    if (!r.ok) {
      throw new Error(j.error || `import-mapped chunk ${i + 1}/${chunks.length}`);
    }
    agg.inserted += j.inserted ?? 0;
    agg.updated += j.updated ?? 0;
    agg.skipped_duplicates += j.skipped_duplicates ?? 0;
    agg.errors += j.errors ?? 0;
    if (j.errorDetails?.length) {
      for (const d of j.errorDetails) {
        if (agg.errorDetails.length < 20) agg.errorDetails.push(d);
      }
    }
    agg.chunks_completed = i + 1;
    onProgress?.(i + 1, chunks.length);
  }
  return agg;
}

/** Client-side sequential chunked POST to import-mapped with extended timeout. */
export async function clientChunkedImportMapped(
  contacts: Record<string, unknown>[],
  options: ImportMappedOptions = {},
  onProgress?: (completed: number, total: number) => void,
): Promise<ChunkedImportAggregate> {
  const chunks = chunkArray(contacts, IMPORT_CHUNK_SIZE);
  const agg: ChunkedImportAggregate = {
    inserted: 0,
    updated: 0,
    skipped_duplicates: 0,
    errors: 0,
    errorDetails: [],
    chunks_total: chunks.length,
    chunks_completed: 0,
  };
  const mode = resolveDuplicateMode(options);
  for (let i = 0; i < chunks.length; i++) {
    const res = await fetchWithTimeout("/api/contacts/import-mapped", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contacts: chunks[i],
        duplicate_mode: mode,
        skip_duplicates: mode === "skip",
        update_existing: mode === "update",
        dry_run: options.dry_run === true,
      }),
      timeoutMs: IMPORT_FETCH_TIMEOUT_MS,
    });
    const j = (await res.json().catch(() => ({}))) as ImportMappedChunkResult;
    if (!res.ok) {
      throw new Error(j.error || `import-mapped chunk ${i + 1}/${chunks.length}`);
    }
    agg.inserted += j.inserted ?? 0;
    agg.updated += j.updated ?? 0;
    agg.skipped_duplicates += j.skipped_duplicates ?? 0;
    agg.errors += j.errors ?? 0;
    if (j.errorDetails?.length) {
      for (const d of j.errorDetails) {
        if (agg.errorDetails.length < 20) agg.errorDetails.push(d);
      }
    }
    agg.chunks_completed = i + 1;
    onProgress?.(i + 1, chunks.length);
  }
  return agg;
}
