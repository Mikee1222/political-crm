import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import {
  DEFAULT_CONTACT_RELATION_TYPE,
  displayRelationTypeForViewer,
  isContactRelationType,
  normalizeRelationTypeForStorage,
} from "@/lib/contact-relation-types";

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
  contact_id_1: string;
  contact_id_2: string;
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
      .select("id, contact_id_1, contact_id_2, relation_type, created_at")
      .or(`contact_id_1.eq.${params.id},contact_id_2.eq.${params.id}`)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const relatedIds = [
      ...new Set(
        (rels ?? []).map((r) => {
          const row = r as { contact_id_1: string; contact_id_2: string };
          return row.contact_id_1 === params.id ? row.contact_id_2 : row.contact_id_1;
        }),
      ),
    ];
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
        contact_id_1: string;
        contact_id_2: string;
        relation_type: string | null;
        created_at: string | null;
      };
      const relatedId = row.contact_id_1 === params.id ? row.contact_id_2 : row.contact_id_1;
      return {
        ...row,
        relation_type: displayRelationTypeForViewer(
          row.relation_type,
          params.id,
          row.contact_id_1,
          row.contact_id_2,
        ),
        related: byId.get(relatedId) ?? null,
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

    const rawType =
      body.relation_type != null && String(body.relation_type).trim() !== ""
        ? String(body.relation_type).trim()
        : DEFAULT_CONTACT_RELATION_TYPE;
    if (!isContactRelationType(rawType)) {
      return NextResponse.json({ error: "Άκυρος τύπος σχέσης" }, { status: 400 });
    }
    const [contactId1, contactId2] = params.id < relatedId ? [params.id, relatedId] : [relatedId, params.id];
    const relationType = normalizeRelationTypeForStorage(params.id, relatedId, rawType);

    const { data: inserted, error } = await supabase
      .from("contact_relations")
      .insert({
        contact_id_1: contactId1,
        contact_id_2: contactId2,
        relation_type: relationType,
      })
      .select("id, contact_id_1, contact_id_2, relation_type, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: related } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, contact_code")
      .eq("id", relatedId)
      .single();

    const insertedRow = inserted as {
      id: string;
      contact_id_1: string;
      contact_id_2: string;
      relation_type: string | null;
      created_at: string | null;
    };

    return NextResponse.json({
      relation: {
        ...insertedRow,
        relation_type: displayRelationTypeForViewer(
          insertedRow.relation_type,
          params.id,
          insertedRow.contact_id_1,
          insertedRow.contact_id_2,
        ),
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
      .or(`contact_id_1.eq.${params.id},contact_id_2.eq.${params.id}`);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/contacts/id/relations DELETE]", e);
    return nextJsonError();
  }
}
