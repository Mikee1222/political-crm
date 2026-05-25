import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

type MunicipalityValueRow = {
  municipality: string | null;
};

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data, error } = await supabase
      .from("contacts")
      .select("municipality")
      .not("municipality", "is", null)
      .neq("municipality", "")
      .order("municipality", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const municipalities = Array.from(
      new Set(
        ((data ?? []) as MunicipalityValueRow[])
          .map((row) => row.municipality?.trim() ?? "")
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "el"));

    return NextResponse.json({ municipalities });
  } catch (e) {
    console.error("[api/municipalities GET]", e);
    return nextJsonError();
  }
}
