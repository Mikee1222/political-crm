import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { NextResponse } from "next/server";

export async function requireManagerEmail() {
  const s = await getSessionWithProfile();
  if (!s.user) {
    return { error: NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 }) };
  }
  if (!hasMinRole(s.profile?.role, "manager")) {
    return { error: forbidden() };
  }
  return s;
}
