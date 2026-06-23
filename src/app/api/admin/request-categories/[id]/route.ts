import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  countRequestsByCategoryName,
  deleteRequestCategoryLookup,
} from "@/lib/request-admin";
import type { RequestCategoryRow } from "@/lib/request-categories";
import { requireSettingsEdit } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Ctx = { params: { id: string } };

function decodeCategoryParam(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const param = decodeCategoryParam(params.id);
    if (!param) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }
    const body = (await request.json()) as { name?: string; color?: string; sort_order?: number | null };
    const patch: Record<string, unknown> = {};
    if (body.name != null) {
      const n = String(body.name).trim();
      if (!n) {
        return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
      }
      patch.name = n;
    }
    if (body.color != null) {
      const c = String(body.color).trim() || "#6B7280";
      if (!HEX.test(c)) {
        return NextResponse.json({ error: "Άκυρο χρώμα" }, { status: 400 });
      }
      patch.color = c;
    }
    if (body.sort_order !== undefined) {
      patch.sort_order = body.sort_order == null ? 0 : Number(body.sort_order);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Κενό" }, { status: 400 });
    }

    let query = supabase.from("request_categories").update(patch);
    if (UUID_RE.test(param)) {
      query = query.eq("id", param);
    } else {
      query = query.eq("name", param);
    }
    const { data, error } = await query
      .select("id, name, color, sort_order, created_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    return NextResponse.json({ category: data as RequestCategoryRow });
  } catch (e) {
    console.error("[api/admin/request-categories id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const name = decodeCategoryParam(params.id);
    if (!name) {
      return NextResponse.json({ error: "Άκυρο" }, { status: 400 });
    }

    const service = createServiceClient();
    const requestCount = await countRequestsByCategoryName(service, name);
    if (requestCount > 0) {
      return NextResponse.json(
        { error: `Υπάρχουν ${requestCount} αιτήματα με αυτή την κατηγορία` },
        { status: 400 },
      );
    }

    if (UUID_RE.test(name)) {
      const { data: row } = await supabase
        .from("request_categories")
        .select("name")
        .eq("id", name)
        .maybeSingle();
      if (row?.name) {
        await deleteRequestCategoryLookup(supabase, row.name);
      }
    } else {
      await deleteRequestCategoryLookup(supabase, name);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα";
    if (msg.includes("Άκυρο")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[api/admin/request-categories id DELETE]", e);
    return nextJsonError();
  }
}
