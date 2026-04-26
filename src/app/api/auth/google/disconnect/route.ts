import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasMinRole } from "@/lib/roles";

export async function DELETE() {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) return forbidden();
  const service = createServiceClient();
  const { error } = await service.from("google_tokens").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
