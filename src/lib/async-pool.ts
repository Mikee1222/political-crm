/**
 * Process indices [from, to) with at most `concurrency` parallel `processIndex` calls.
 * A new index is started only when a worker is free; order of completion is not defined.
 */
export function runIndexRangeWithConcurrency(
  from: number,
  to: number,
  concurrency: number,
  processIndex: (index: number) => Promise<void>,
): Promise<void> {
  if (from >= to) return Promise.resolve();
  const n = to - from;
  const c = Math.max(1, Math.min(concurrency, n));
  let next = from;
  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= to) return;
      await processIndex(idx);
    }
  };
  return Promise.all(Array.from({ length: c }, () => worker())).then(() => {
    /* all workers finished */
  });
}
