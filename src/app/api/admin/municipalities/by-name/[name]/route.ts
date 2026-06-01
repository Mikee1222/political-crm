import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireManagerApi } from "@/lib/require-manager-api";
import { createServiceClient } from "@/lib/supabase/admin";
import { countContactsByMunicipality } from "@/lib/contact-location-admin";

export const dynamic = "force-dynamic";

export async function DELETE(_: NextRequest, { params }: { params: { name: string } }) {
  try {
    const crm = await checkCRMAccess();
    const denied = requireManagerApi(crm);
    if (denied) return denied;

    const name = decodeURIComponent(params.name).trim();
    if (!name) {
      return NextResponse.json({ error: "Άκυρο όνομα" }, { status: 400 });
    }

    const service = createServiceClient();
    const contact_count = await countContactsByMunicipality(service, name);
    if (contact_count > 0) {
      return NextResponse.json(
        { error: `Δεν μπορεί να διαγραφεί — ${contact_count} επαφές χρησιμοποιούν αυτόν τον δήμο` },
        { status: 409 },
      );
    }

    await service.from("municipalities").delete().eq("name", name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/municipalities/by-name DELETE]", e);
    return nextJsonError();
  }
}
