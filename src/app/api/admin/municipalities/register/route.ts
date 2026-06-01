import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireManagerApi } from "@/lib/require-manager-api";
import { createServiceClient } from "@/lib/supabase/admin";
import { listContactMunicipalitiesWithCounts } from "@/lib/contact-location-admin";

export const dynamic = "force-dynamic";

/** Registers a municipality name in the geo table so it appears in admin lists before any contact uses it. */
export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    const denied = requireManagerApi(crm);
    if (denied) return denied;

    const body = (await request.json()) as { name?: string };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: existing } = await service.from("municipalities").select("id").eq("name", name).maybeSingle();
    if (!existing) {
      const { error } = await service.from("municipalities").insert({ name, regional_unit: null });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const municipalities = await listContactMunicipalitiesWithCounts(service);
    const row = municipalities.find((m) => m.name === name) ?? { name, contact_count: 0 };
    return NextResponse.json({ municipality: row });
  } catch (e) {
    console.error("[api/admin/municipalities/register POST]", e);
    return nextJsonError();
  }
}
