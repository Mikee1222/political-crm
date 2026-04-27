import { NextRequest, NextResponse } from "next/server";
import { registerPortalCitizen } from "@/lib/portal";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      invite?: string;
    };
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const first_name = String(body.first_name ?? "").trim();
    const last_name = String(body.last_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    if (!email || !password || !first_name || !last_name) {
      return NextResponse.json({ error: "Συμπληρώστε τα υποχρεωτικά πεδία" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες" }, { status: 400 });
    }
    const { userId, error } = await registerPortalCitizen({
      email,
      password,
      first_name,
      last_name,
      phone,
      invite_token: String(body.invite ?? "").trim() || undefined,
    });
    if (error || !userId) {
      return NextResponse.json({ error: error ?? "Σφάλμα εγγραφής" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, userId });
  } catch (e) {
    console.error("[api/portal/auth/register]", e);
    return nextJsonError();
  }
}
