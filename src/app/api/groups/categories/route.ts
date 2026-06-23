import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { requireSettingsEdit } from "@/lib/require-permission-api";

export const dynamic = "force-dynamic";

const DEFAULT_CATEGORY = "Άλλο";

/** Unique category names from contact_groups (non-null), sorted. */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;
    const { data, error } = await supabase
      .from("contact_groups")
      .select("category")
      .not("category", "is", null)
      .order("category", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const categories = [
      ...new Set(
        (data ?? [])
          .map((r) => (r as { category: string | null }).category)
          .filter((c): c is string => Boolean(c && String(c).trim())),
      ),
    ].sort((a, b) => a.localeCompare(b, "el"));
    return NextResponse.json({ categories });
  } catch (e) {
    console.error("[api/groups/categories GET]", e);
    return nextJsonError();
  }
}

type PostBody = {
  action?: string;
  oldName?: string;
  newName?: string;
  groupIds?: string[];
  category?: string;
};

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess(request);
    if (!crm.allowed) return crm.response;
    const denied = await requireSettingsEdit(crm);
    if (denied) return denied;
    const { supabase } = crm;

    const body = (await request.json()) as PostBody;
    const action = String(body.action ?? "").trim();

    if (action === "create") {
      return NextResponse.json({ ok: true });
    }

    if (action === "rename") {
      const oldName = String(body.oldName ?? "").trim();
      const newName = String(body.newName ?? "").trim();
      if (!oldName || !newName) {
        return NextResponse.json({ error: "Υποχρεωτικά oldName και newName" }, { status: 400 });
      }
      if (oldName === newName) {
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from("contact_groups").update({ category: newName }).eq("category", oldName);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "assign") {
      const category = String(body.category ?? "").trim();
      const groupIds = Array.isArray(body.groupIds) ? body.groupIds.filter((id) => typeof id === "string" && id.trim()) : [];
      if (!category || groupIds.length === 0) {
        return NextResponse.json({ error: "Υποχρεωτικά category και groupIds" }, { status: 400 });
      }
      const { error } = await supabase.from("contact_groups").update({ category }).in("id", groupIds);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const oldName = String(body.oldName ?? "").trim();
      if (!oldName) {
        return NextResponse.json({ error: "Υποχρεωτικό oldName" }, { status: 400 });
      }
      if (oldName === DEFAULT_CATEGORY) {
        return NextResponse.json({ error: "Δεν μπορείτε να διαγράψετε την προεπιλογή" }, { status: 400 });
      }
      const { error } = await supabase
        .from("contact_groups")
        .update({ category: DEFAULT_CATEGORY })
        .eq("category", oldName);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Άγνωστη ενέργεια" }, { status: 400 });
  } catch (e) {
    console.error("[api/groups/categories POST]", e);
    return nextJsonError();
  }
}
