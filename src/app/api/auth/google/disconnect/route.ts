import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export async function DELETE() {
  try {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();
  const service = createServiceClient();
  const { error } = await service.from("google_tokens").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/auth/google/disconnect]", e);
    return nextJsonError();
  }
}
