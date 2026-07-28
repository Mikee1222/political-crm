/**
 * Helpers for Server-Timing response headers and console profiling in API routes.
 */

export type TimingMark = { name: string; durationMs: number; description?: string };

/** Time a single promise; use inside Promise.all for per-fetch duration logs. */
export async function timedFetch<T>(
  label: string,
  promise: PromiseLike<T>,
): Promise<{ label: string; ms: number; value: T }> {
  const t0 = Date.now();
  const value = await promise;
  return { label, ms: Date.now() - t0, value };
}

/** Log `[prefix] a: 12ms, b: 34ms, ...` from timedFetch results. */
export function logFetchTimings(
  prefix: string,
  parts: Array<{ label: string; ms: number }>,
): void {
  const body = parts.map((p) => `${p.label}: ${p.ms}ms`).join(", ");
  console.log(`[${prefix}] ${body}`);
}

export function createServerTiming() {
  const marks: TimingMark[] = [];
  const startedAt = Date.now();

  return {
    async time<T>(name: string, fn: () => Promise<T>, description?: string): Promise<T> {
      const t0 = Date.now();
      try {
        return await fn();
      } finally {
        const durationMs = Date.now() - t0;
        marks.push({ name, durationMs, description });
        console.log(`[server-timing] ${name}: ${durationMs}ms${description ? ` (${description})` : ""}`);
      }
    },
    mark(name: string, durationMs: number, description?: string) {
      marks.push({ name, durationMs, description });
      console.log(`[server-timing] ${name}: ${durationMs}ms${description ? ` (${description})` : ""}`);
    },
    headerValue(): string {
      const total = Date.now() - startedAt;
      const parts = [
        ...marks.map((m) => {
          const desc = m.description ? `;desc="${m.description.replace(/"/g, "")}"` : "";
          return `${m.name};dur=${m.durationMs}${desc}`;
        }),
        `total;dur=${total}`,
      ];
      return parts.join(", ");
    },
    marks,
  };
}

export function withServerTimingHeaders(
  res: Response,
  timing: ReturnType<typeof createServerTiming>,
): Response {
  const headers = new Headers(res.headers);
  headers.set("Server-Timing", timing.headerValue());
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
