import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { data, error } = await supabase
      .from("saved_filters")
      .select("id, name, description, filters, created_at, created_by")
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ saved_filters: data ?? [] });
  } catch (e) {
    console.error("[api/saved-filters GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "admin")) {
      return forbidden();
    }
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      filters?: unknown;
    };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Όνομα απαιτείται" }, { status: 400 });
    }
    if (body.filters == null || typeof body.filters !== "object" || Array.isArray(body.filters)) {
      return NextResponse.json({ error: "Μη έγκυρα φίλτρα (object)" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("saved_filters")
      .insert({
        name,
        description: String(body.description ?? "").trim() || null,
        filters: body.filters as object,
        created_by: user.id,
      })
      .select("id, name, description, filters, created_at, created_by")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ saved_filter: data });
  } catch (e) {
    console.error("[api/saved-filters POST]", e);
    return nextJsonError();
  }
}
