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
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const { data, error } = await supabase
      .from("generated_social_posts")
      .select("id, platform, topic, content, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return NextResponse.json({ error: error.message, items: [] }, { status: 200 });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("[api/content/social-saved GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const b = (await request.json()) as { platform?: string; topic?: string; content?: string };
    if (!b.content?.trim()) {
      return NextResponse.json({ error: "Κενό περιεχόμενο" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("generated_social_posts")
      .insert({
        platform: b.platform ?? null,
        topic: b.topic ?? null,
        content: b.content.trim(),
        user_id: user.id,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[api/content/social-saved POST]", e);
    return nextJsonError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id" }, { status: 400 });
    const { error } = await supabase.from("generated_social_posts").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/content/social-saved DELETE]", e);
    return nextJsonError();
  }
}
