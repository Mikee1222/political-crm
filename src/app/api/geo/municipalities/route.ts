import { NextResponse } from "next/server";
import { getSessionWithProfile } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export type MunicipalityRow = {
  id: string;
  name: string;
  regional_unit: string | null;
  created_at: string;
};

export async function GET() {
  try {
    const { user, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const { data, error } = await supabase
      .from("municipalities")
      .select("id, name, regional_unit, created_at")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ municipalities: (data ?? []) as MunicipalityRow[] });
  } catch (e) {
    console.error("[api/geo/municipalities GET]", e);
    return nextJsonError();
  }
}
