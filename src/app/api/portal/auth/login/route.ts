import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/portal";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return NextResponse.json({ error: "Email και κωδικός απαιτούνται" }, { status: 400 });
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Λάθος στοιχεία" }, { status: 401 });
    }
    const row = await getPortalUser(supabase, data.user.id);
    if (!row) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Αυτός ο λογαριασμός δεν έχει πρόσβαση στην πύλη. Χρησιμοποιήστε τη σύνδεση προσωπικού." },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, userId: data.user.id });
  } catch (e) {
    console.error("[api/portal/auth/login]", e);
    return nextJsonError();
  }
}
