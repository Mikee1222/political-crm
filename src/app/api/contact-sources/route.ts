import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export type ContactSourceRow = {
  id: string;
  name: string;
};

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data, error } = await supabase
      .from("contact_sources")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ sources: (data ?? []) as ContactSourceRow[] });
  } catch (e) {
    console.error("[api/contact-sources GET]", e);
    return nextJsonError();
  }
}
