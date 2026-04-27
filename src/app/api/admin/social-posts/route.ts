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

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!isCrmUser(profile) || profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("social_posts")
      .select("id, platform, url, active, sort_order, created_at")
      .in("platform", ["tiktok", "facebook"])
      .order("platform", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ posts: data ?? [] });
  } catch (e) {
    console.error("[api/admin/social-posts GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!isCrmUser(profile) || profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      platform: string;
      url: string;
      active?: boolean;
      sort_order?: number;
    };
    const platform = String(body.platform ?? "").trim();
    if (!PLATFORMS.has(platform)) {
      return NextResponse.json({ error: "Μη έγκυρη πλατφόρμα" }, { status: 400 });
    }
    const url = String(body.url ?? "").trim();
    if (!url || !validUrl(url)) {
      return NextResponse.json({ error: "Απαιτείται έγκυρο URL" }, { status: 400 });
    }
    const active = body.active !== false;
    const sort_order = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;
    const { data, error } = await supabase
      .from("social_posts")
      .insert({ platform, url, active, sort_order })
      .select("id, platform, url, active, sort_order, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ post: data });
  } catch (e) {
    console.error("[api/admin/social-posts POST]", e);
    return nextJsonError();
  }
}
