/**
 * Default timeout for client-side fetches to avoid hanging UI.
 */
export const CLIENT_FETCH_TIMEOUT_MS = 8_000;

type FetchWithTimeoutOptions = RequestInit & { timeoutMs?: number };

/** Same-origin `fetch` with `AbortController` and default 8s timeout. */
export async function fetchWithTimeout(
  input: string | URL,
  { timeoutMs = CLIENT_FETCH_TIMEOUT_MS, signal: outerSignal, ...init }: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  if (outerSignal) {
    if (outerSignal.aborted) {
      clearTimeout(t);
      throw new DOMException("Aborted", "AbortError");
    }
    outerSignal.addEventListener("abort", () => {
      clearTimeout(t);
      ctrl.abort();
    });
  }
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
