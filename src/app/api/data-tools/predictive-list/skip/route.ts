import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { todayYmdAthens } from "@/lib/athens-ranges";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contact_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const ymd = todayYmdAthens();
    const { error } = await supabase.from("daily_call_list_skips").upsert(
      {
        date: ymd,
        contact_id: parsed.data.contact_id,
      } as never,
      { onConflict: "date,contact_id" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/data-tools/predictive-list/skip]", e);
    return nextJsonError();
  }
}
