import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  return NextResponse.json({ publicKey: k || null });
}
