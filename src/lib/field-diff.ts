/** Shallow field-by-field diff for audit logs (JSON-serializable values). */
export function fieldDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys?: string[],
): Record<string, { from: unknown; to: unknown }> {
  const a = before ?? {};
  const b = after ?? {};
  const ks = keys ?? [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ks) {
    if (
      k === "updated_at" ||
      k === "created_at" ||
      k === "password" ||
      k === "updated_by" ||
      k === "created_by" ||
      k === "completed_at"
    ) {
      continue;
    }
    const v0 = a[k];
    const v1 = b[k];
    const s0 = JSON.stringify(v0) ?? String(v0);
    const s1 = JSON.stringify(v1) ?? String(v1);
    if (s0 !== s1) {
      out[k] = { from: v0 ?? null, to: v1 ?? null };
    }
  }
  return out;
}
