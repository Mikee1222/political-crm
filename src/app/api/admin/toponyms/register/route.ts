import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireManagerApi } from "@/lib/require-manager-api";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Insert a toponym by name (optionally linked to a geo municipality). */
export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    const denied = requireManagerApi(crm);
    if (denied) return denied;

    const body = (await request.json()) as { name?: string; municipality_id?: string };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }

    const service = createServiceClient();
    let municipality_id = body.municipality_id != null ? String(body.municipality_id).trim() : "";
    if (!municipality_id) {
      const { data: first } = await service.from("municipalities").select("id").order("name").limit(1).maybeSingle();
      municipality_id = first?.id ? String(first.id) : "";
    }
    if (!municipality_id) {
      return NextResponse.json({ error: "Προσθέστε πρώτα δήμο στα γεωγραφικά δεδομένα" }, { status: 400 });
    }

    const { data, error } = await service
      .from("toponyms")
      .insert({ name, municipality_id, electoral_district_id: null })
      .select("id, name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ toponym: { id: data.id as string, name: data.name as string, contact_count: 0 } });
  } catch (e) {
    console.error("[api/admin/toponyms/register POST]", e);
    return nextJsonError();
  }
}
