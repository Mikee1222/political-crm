import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/portal";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const portal = await getPortalUser(supabase, user.id);
    if (!portal) {
      return NextResponse.json({ error: "Δεν είστε πολίτης πύλης" }, { status: 403 });
    }
    const safe = { ...portal } as Record<string, unknown>;
    delete safe.verification_token;
    return NextResponse.json({ portal: safe, email: user.email });
  } catch (e) {
    console.error("[api/portal/me GET]", e);
    return nextJsonError();
  }
}
