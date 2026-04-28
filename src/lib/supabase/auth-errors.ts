/** Detect Supabase refresh failures that should clear the session (avoid auth loops). */
export function isInvalidRefreshTokenError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const o = err as { message?: string; code?: string };
  const msg = String(o.message ?? "").toLowerCase();
  const code = String(o.code ?? "").toLowerCase();
  return (
    code === "refresh_token_not_found" ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found")
  );
}
