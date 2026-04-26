import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { getSessionWithProfile } from "@/lib/auth-helpers";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user, profile } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    return NextResponse.json({ profile });
  } catch (e) {
    console.error("[api/profile GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest) {
  try {
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
  } catch (e) {
    console.error("[api/profile PUT]", e);
    return nextJsonError();
  }
}
