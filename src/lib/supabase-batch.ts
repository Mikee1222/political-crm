/** PostgREST / Supabase caps each `.range()` response at this many rows. */
export const SUPABASE_MAX_PAGE_ROWS = 1000;

type RangeQueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

/**
 * Page through a PostgREST query until all rows are loaded (avoids silent 1000-row truncate).
 * `buildRangeQuery` must apply `.range(from, to)` on the returned builder and execute it.
 */
export async function fetchRowsInBatches<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildRangeQuery: (from: number, to: number) => any,
  pageSize = SUPABASE_MAX_PAGE_ROWS,
): Promise<{ rows: T[]; error: string | null }> {
  const size = Math.min(Math.max(1, pageSize), SUPABASE_MAX_PAGE_ROWS);
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const result = (await buildRangeQuery(from, from + size - 1)) as RangeQueryResult;
    if (result.error) {
      return { rows: [], error: result.error.message };
    }
    const chunk = (result.data ?? []) as T[];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < size) break;
    from += size;
  }
  return { rows, error: null };
}
