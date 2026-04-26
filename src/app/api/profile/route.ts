import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile } from "@/lib/auth-helpers";

export async function GET() {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  return NextResponse.json({ profile });
}

export async function PUT(request: NextRequest) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  const body = (await request.json()) as { full_name?: string };
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: body.full_name ?? profile.full_name })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
