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
    const body = (await request.json()) as { newEmail?: string; confirm?: string };
    const a = (body.newEmail ?? "").trim().toLowerCase();
    const b = (body.confirm ?? "").trim().toLowerCase();
    if (!a || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) {
      return NextResponse.json({ error: "Μη έγκυρο email" }, { status: 400 });
    }
    if (a !== b) {
      return NextResponse.json({ error: "Η επιβεβαίωση email δεν ταιριάζει" }, { status: 400 });
    }
    if (a === (user.email ?? "").toLowerCase()) {
      return NextResponse.json({ error: "Το νέο email είναι ίδιο με το τρέχον" }, { status: 400 });
    }
    const { error: upErr } = await supabase.auth.updateUser({ email: a });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Έλεγχος το inbox για επιβεβαίωση (αν απαιτείται)" });
  } catch (e) {
    console.error("[api/profile/email]", e);
    return nextJsonError();
  }
}
