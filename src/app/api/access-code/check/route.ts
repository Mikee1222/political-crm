import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ACCESS_COOKIE = "crm_access_granted";

/** GET — whether current user has CRM access (admin or valid access cookie). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ granted: false });

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") return NextResponse.json({ granted: true });

  const cookieStore = await cookies();
  const granted = cookieStore.get(ACCESS_COOKIE)?.value === "1";
  return NextResponse.json({ granted });
}
