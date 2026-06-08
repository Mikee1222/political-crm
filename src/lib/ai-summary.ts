import { anthropicComplete } from "@/lib/anthropic-once";

export const SUMMARY_MODEL = "claude-sonnet-4-6";
export const SUMMARY_MAX_TOKENS = 800;
export const SUMMARY_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export function truncateNote(text: string | null | undefined, max = 200): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function isSummaryCacheFresh(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age >= 0 && age < SUMMARY_CACHE_MS;
}

export type CachedSummaryRow = {
  ai_summary?: string | null;
  ai_summary_updated_at?: string | null;
};

export function readCachedSummary(row: CachedSummaryRow | null | undefined): {
  summary: string | null;
  cached: boolean;
  updated_at: string | null;
} {
  const updated_at = row?.ai_summary_updated_at ?? null;
  const summary = row?.ai_summary?.trim() || null;
  if (summary && isSummaryCacheFresh(updated_at)) {
    return { summary, cached: true, updated_at };
  }
  return { summary: null, cached: false, updated_at };
}

export async function generateSummaryText(
  system: string,
  userContent: string,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const out = await anthropicComplete(system, userContent, {
    model: SUMMARY_MODEL,
    maxTokens: SUMMARY_MAX_TOKENS,
  });
  if (!out.ok) {
    return { ok: false, error: out.error };
  }
  return { ok: true, summary: out.text.trim() };
}
