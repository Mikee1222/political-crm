import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { isCrmUser, forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

const PLATFORMS = new Set(["tiktok", "facebook"]);

function validUrl(s: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(s.trim());
    return true;
  } catch {
    return false;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!isCrmUser(profile) || profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      platform?: string;
      url?: string;
      active?: boolean;
      sort_order?: number;
    };
    const patch: Record<string, string | number | boolean> = {};
    if (body.url !== undefined) {
      const url = String(body.url ?? "").trim();
      if (!url || !validUrl(url)) {
        return NextResponse.json({ error: "Μη έγκυρο URL" }, { status: 400 });
      }
      patch.url = url;
    }
    if (body.platform !== undefined) {
      const p = String(body.platform).trim();
      if (!PLATFORMS.has(p)) {
        return NextResponse.json({ error: "Μη έγκυρη πλατφόρμα" }, { status: 400 });
      }
      patch.platform = p;
    }
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Καμία αλλαγή" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("social_posts")
      .update(patch)
      .eq("id", id)
      .select("id, platform, url, active, sort_order, created_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    return NextResponse.json({ post: data });
  } catch (e) {
    console.error("[api/admin/social-posts PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!isCrmUser(profile) || profile?.role !== "admin") {
      return forbidden();
    }
    const { error } = await supabase.from("social_posts").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/social-posts DELETE]", e);
    return nextJsonError();
  }
}
