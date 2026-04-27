import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const u = request.nextUrl.searchParams.get("url");
    if (!u?.trim()) {
      return NextResponse.json({ error: "Χρειάζεται url" }, { status: 400 });
    }
    const size = Math.min(800, Math.max(64, parseInt(request.nextUrl.searchParams.get("size") ?? "256", 10) || 256));
    let target: string;
    try {
      target = new URL(u).toString();
    } catch {
      return NextResponse.json({ error: "Άκυρο url" }, { status: 400 });
    }
    const buf = await QRCode.toBuffer(target, {
      type: "png",
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0A1628", light: "#FFFFFFFF" },
    });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[api/qrcode]", e);
    return nextJsonError();
  }
}
