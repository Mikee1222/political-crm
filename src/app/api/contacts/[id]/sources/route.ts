import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

type ContactSourceRow = {
  id: string;
  name: string;
};

type ContactSourceMemberRow = {
  source_id: string;
};

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const { data: members, error } = await supabase
      .from("contact_source_members")
      .select("source_id")
      .eq("contact_id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const sourceIds = Array.from(new Set(((members ?? []) as ContactSourceMemberRow[]).map((row) => row.source_id)));
    if (sourceIds.length === 0) {
      return NextResponse.json({ sources: [] as ContactSourceRow[] });
    }

    const { data: sources, error: sourceError } = await supabase
      .from("contact_sources")
      .select("id, name")
      .in("id", sourceIds)
      .order("name", { ascending: true });

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 400 });
    }

    return NextResponse.json({ sources: (sources ?? []) as ContactSourceRow[] });
  } catch (e) {
    console.error("[api/contacts/id/sources GET]", e);
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

    const body = (await request.json()) as { source_id?: string };
    const sourceId = String(body.source_id ?? "").trim();
    if (!sourceId) {
      return NextResponse.json({ error: "Απαιτείται source_id" }, { status: 400 });
    }

    const { data: source, error: sourceError } = await supabase
      .from("contact_sources")
      .select("id, name")
      .eq("id", sourceId)
      .single();

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("contact_source_members")
      .select("source_id")
      .eq("contact_id", params.id)
      .eq("source_id", sourceId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existing) {
      const { error } = await supabase.from("contact_source_members").insert({
        contact_id: params.id,
        source_id: sourceId,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ source: source as ContactSourceRow });
  } catch (e) {
    console.error("[api/contacts/id/sources POST]", e);
    return nextJsonError();
  }
}
