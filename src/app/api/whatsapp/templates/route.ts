import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

/** Πρότυπα μηνυμάτων (WhatsApp Business Account id στο Meta). */
export async function GET() {
  try {
    const { user, profile } = await getSessionWithProfile();
    if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const waba = process.env.WHATSAPP_WABA_ID?.trim();
    const token = process.env.WHATSAPP_TOKEN?.trim();
    if (!waba || !token) {
      return NextResponse.json({ templates: [], info: "Ορισμός WHATSAPP_WABA_ID για λίστα από Meta" });
    }
    const u = new URL(`https://graph.facebook.com/v21.0/${waba}/message_templates`);
    u.searchParams.set("fields", "name,status,language,category");
    u.searchParams.set("limit", "50");
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json().catch(() => ({}))) as { data?: unknown[]; error?: { message?: string } };
    if (!res.ok) {
      return NextResponse.json(
        { templates: [], error: j.error?.message ?? "fetch failed" },
        { status: 200 },
      );
    }
    return NextResponse.json({ templates: j.data ?? [] });
  } catch (e) {
    console.error("[api/whatsapp/templates]", e);
    return nextJsonError();
  }
}
