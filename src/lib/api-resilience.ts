import { NextResponse } from "next/server";

/** 5s server-side cap for “empty data” list/search APIs */
export const API_RACE_MS = 5_000;

export function nextJsonError(message = "Σφάλμα διακομιστή", status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/** Rejects / resolves `timeout` for Promise.race. */
export function raceTimeout(ms: number): Promise<"timeout"> {
  return new Promise((r) => setTimeout(() => r("timeout"), ms));
}

/**
 * Await a Supabase / PromiseLike query with a wall-clock cap.
 * On timeout or promise rejection, resolves `"timeout"`.
 */
export function withTimeoutQuery<T>(p: PromiseLike<T>, ms: number): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve("timeout"), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve("timeout");
      },
    );
  });
}

/**
 * Run an async block; if it does not complete within `ms`, return `fallback` (e.g. empty `NextResponse`).
 * Note: the inner work may still run in the background.
 */
export async function runWithTimeCap<T>(ms: number, work: () => Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    work()
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        console.error("[api] runWithTimeCap", e);
        resolve(fallback);
      });
  });
}
