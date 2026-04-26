import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export type ToponymRow = {
  id: string;
  name: string;
  municipality_id: string;
  electoral_district_id: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const muniId = request.nextUrl.searchParams.get("municipality_id")?.trim();
    const distId = request.nextUrl.searchParams.get("electoral_district_id")?.trim() ?? null;
    if (!muniId) {
      return NextResponse.json({ error: "Υποχρεωτικό municipality_id" }, { status: 400 });
    }
    let q = supabase
      .from("toponyms")
      .select("id, name, municipality_id, electoral_district_id, created_at")
      .eq("municipality_id", muniId);
    if (distId) {
      q = q.or(`electoral_district_id.eq.${distId},electoral_district_id.is.null`);
    }
    const { data, error } = await q.order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ toponyms: (data ?? []) as ToponymRow[] });
  } catch (e) {
    console.error("[api/geo/toponyms GET]", e);
    return nextJsonError();
  }
}
