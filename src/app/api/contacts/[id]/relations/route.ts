import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

type RelatedContact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  contact_code: string | null;
};

type RelatedRow = {
  id: string;
  contact_id: string;
  related_contact_id: string;
  relation_type: string | null;
  created_at: string | null;
  related: RelatedContact | null;
};

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const { data: rels, error } = await supabase
      .from("contact_relations")
      .select("id, contact_id, related_contact_id, relation_type, created_at")
      .eq("contact_id", params.id)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const relatedIds = [...new Set((rels ?? []).map((r) => (r as { related_contact_id: string }).related_contact_id))];
    let byId = new Map<string, RelatedContact>();
    if (relatedIds.length > 0) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, contact_code")
        .in("id", relatedIds);
      byId = new Map(
        ((contacts ?? []) as RelatedContact[]).map((c) => [c.id, c] as const),
      );
    }

    const relations: RelatedRow[] = (rels ?? []).map((r) => {
      const row = r as {
        id: string;
        contact_id: string;
        related_contact_id: string;
        relation_type: string | null;
        created_at: string | null;
      };
      return {
        ...row,
        related: byId.get(row.related_contact_id) ?? null,
      };
    });

    return NextResponse.json({ relations });
  } catch (e) {
    console.error("[api/contacts/id/relations GET]", e);
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
      related_contact_id?: string;
      relation_type?: string | null;
    };
    const relatedId = String(body.related_contact_id ?? "").trim();
    if (!relatedId || relatedId === params.id) {
      return NextResponse.json({ error: "Άκυρη επαφή" }, { status: 400 });
    }

    const relationType =
      body.relation_type != null && String(body.relation_type).trim() !== ""
        ? String(body.relation_type).trim()
        : "family";

    const { data: inserted, error } = await supabase
      .from("contact_relations")
      .insert({
        contact_id: params.id,
        related_contact_id: relatedId,
        relation_type: relationType,
      })
      .select("id, contact_id, related_contact_id, relation_type, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: related } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, contact_code")
      .eq("id", relatedId)
      .single();

    return NextResponse.json({
      relation: {
        ...(inserted as RelatedRow),
        related: (related as RelatedContact | null) ?? null,
      },
    });
  } catch (e) {
    console.error("[api/contacts/id/relations POST]", e);
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

    const relationId = request.nextUrl.searchParams.get("relation_id")?.trim() ?? "";
    if (!relationId) {
      return NextResponse.json({ error: "Απαιτείται relation_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("contact_relations")
      .delete()
      .eq("id", relationId)
      .eq("contact_id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/contacts/id/relations DELETE]", e);
    return nextJsonError();
  }
}
