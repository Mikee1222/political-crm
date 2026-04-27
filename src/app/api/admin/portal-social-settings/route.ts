import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, isCrmUser, forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!isCrmUser(profile) || profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("portal_social_settings")
      .select("id, show_tiktok, show_facebook, show_instagram, instagram_follower_label, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ settings: data });
  } catch (e) {
    console.error("[api/admin/portal-social-settings GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!isCrmUser(profile) || profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      show_tiktok?: boolean;
      show_facebook?: boolean;
      show_instagram?: boolean;
      instagram_follower_label?: string | null;
    };
    const rawLabel = body.instagram_follower_label;
    const labelOk =
      rawLabel === null || rawLabel === undefined
        ? null
        : String(rawLabel).trim() === ""
          ? null
          : String(rawLabel).trim();
    const patch = {
      show_tiktok: body.show_tiktok ?? true,
      show_facebook: body.show_facebook ?? true,
      show_instagram: body.show_instagram ?? true,
      instagram_follower_label: labelOk,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("portal_social_settings")
      .upsert({ id: 1, ...patch }, { onConflict: "id" })
      .select("id, show_tiktok, show_facebook, show_instagram, instagram_follower_label, updated_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ settings: data });
  } catch (e) {
    console.error("[api/admin/portal-social-settings PUT]", e);
    return nextJsonError();
  }
}
