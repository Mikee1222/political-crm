import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    if (!isWhatsAppConfigured()) {
      return NextResponse.json({ ok: false, error: "Λείπουν env WHATSAPP_TOKEN / WHATSAPP_PHONE_ID" });
    }
    const id = process.env.WHATSAPP_PHONE_ID!.trim();
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${id}?fields=display_phone_number,verified_name`,
      {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      },
    );
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: (j as { error?: { message?: string } }).error?.message ?? "API error" });
    }
    return NextResponse.json({ ok: true, details: j });
  } catch (e) {
    console.error("[api/whatsapp/test]", e);
    return nextJsonError();
  }
}
