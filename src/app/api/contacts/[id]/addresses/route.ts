import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data, error } = await supabase
      .from("contact_addresses")
      .select("id, contact_id, type, odos, poli, tk, send_post, created_at")
      .eq("contact_id", params.id)
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ addresses: data ?? [] });
  } catch (e) {
    console.error("[api/contacts/id/addresses GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as {
      type?: string;
      odos?: string;
      poli?: string;
      tk?: string;
      send_post?: boolean;
    };
    const type = String(body.type ?? "Οικία").trim() || "Οικία";

    const { data, error } = await supabase
      .from("contact_addresses")
      .insert({
        contact_id: params.id,
        type,
        odos: body.odos != null ? String(body.odos).trim() || null : null,
        poli: body.poli != null ? String(body.poli).trim() || null : null,
        tk: body.tk != null ? String(body.tk).trim() || null : null,
        send_post: Boolean(body.send_post),
      })
      .select("id, contact_id, type, odos, poli, tk, send_post, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ address: data });
  } catch (e) {
    console.error("[api/contacts/id/addresses POST]", e);
    return nextJsonError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as { address_id?: string };
    const addressId = String(body.address_id ?? "").trim();
    if (!addressId) {
      return NextResponse.json({ error: "Απαιτείται address_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("contact_addresses")
      .delete()
      .eq("id", addressId)
      .eq("contact_id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/contacts/id/addresses DELETE]", e);
    return nextJsonError();
  }
}
