import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

/**
 * Αποστολή email επαναφοράς κωδικού (Supabase Auth recover).
 */
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { user, profile } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (profile?.role !== "admin") return forbidden();

  const admin = createServiceClient();
  const { data: udata, error: uerr } = await admin.auth.admin.getUserById(params.id);
  if (uerr || !udata.user?.email) {
    return NextResponse.json({ error: uerr?.message ?? "Χρήστης δεν βρέθηκε" }, { status: 400 });
  }
  const email = udata.user.email;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${url}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: t || "Αποτυχία αποστολής" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/users/reset-password]", e);
    return nextJsonError();
  }
}
