import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/portal";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: "Δεν είστε πολίτης" }, { status: 403 });
    }
    const sub = (await request.json()) as { subscription?: unknown };
    if (!sub.subscription) {
      return NextResponse.json({ error: "Λείπει subscription" }, { status: 400 });
    }
    const { error } = await supabase
      .from("portal_users")
      .update({ push_subscription: sub.subscription as never })
      .eq("auth_user_id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
