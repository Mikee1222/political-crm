import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the API key against `ELEVENLABS_API_SECRET` from (in order):
 * - header `x-api-key`, or if empty
 * - query parameter `key` (avoid in untrusted clients — may be logged in URLs)
 * Returns null if OK, or a JSON error response.
 */
export function requirePublicApiKey(request: NextRequest): NextResponse | null {
  const secret = process.env.ELEVENLABS_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Ρύθμιση ελλιπής (ELEVENLABS_API_SECRET)" }, { status: 503 });
  }
  const headerKey = request.headers.get("x-api-key")?.trim() ?? "";
  const queryKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
  const key = headerKey || queryKey;
  const a = Buffer.from(key, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  return null;
}
