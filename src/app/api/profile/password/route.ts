import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, supabase } = crm;
    if (!user?.email) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    const body = (await request.json()) as { currentPassword?: string; newPassword?: string; confirm?: string };
    const cur = body.currentPassword ?? "";
    const n = body.newPassword ?? "";
    const c = body.confirm ?? "";
    if (n.length < 8) {
      return NextResponse.json({ error: "Νέος κωδικός: τουλάχιστον 8 χαρακτήρες" }, { status: 400 });
    }
    if (n !== c) {
      return NextResponse.json({ error: "Η επιβεβαίωση δεν ταιριάζει" }, { status: 400 });
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: cur,
    });
    if (signErr) {
      return NextResponse.json({ error: "Λάθος τρέχον κωδικός" }, { status: 400 });
    }
    const { error: upErr } = await supabase.auth.updateUser({ password: n });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/profile/password]", e);
    return nextJsonError();
  }
}
