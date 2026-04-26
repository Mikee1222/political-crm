import { CLIENT_FETCH_TIMEOUT_MS, fetchWithTimeout } from "./client-fetch";

export { CLIENT_FETCH_TIMEOUT_MS, fetchWithTimeout } from "./client-fetch";

/** Fetch JSON with optional timeout. On network error, non-2xx, or parse failure, returns `fallback`. */
export async function fetchJsonWithTimeout<T>(
  url: string,
  fallback: T,
  timeoutMs = CLIENT_FETCH_TIMEOUT_MS,
): Promise<T> {
  try {
    const res = await fetchWithTimeout(url, { timeoutMs, credentials: "same-origin" });
    if (!res.ok) return fallback;
    const text = await res.text();
    if (!text) return fallback;
    try {
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  } catch {
    return fallback;
  }
}
