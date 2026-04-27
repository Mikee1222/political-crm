import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { isCrmUser, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { slugifyNews } from "@/lib/portal";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!isCrmUser(profile) || !hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase.from("news_posts").select("*").eq("id", params.id).single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ post: data });
  } catch (e) {
    console.error("[api/news-posts id GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!isCrmUser(profile) || !hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as Record<string, unknown>;
    const { data: cur } = await supabase.from("news_posts").select("title, published").eq("id", params.id).maybeSingle();
    if (!cur) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const wasPublished = Boolean((cur as { published?: boolean }).published);
    const nextPublished =
      (body as { published?: boolean }).published !== undefined
        ? Boolean((body as { published: boolean }).published)
        : wasPublished;
    const title =
      (body as { title?: string }).title != null
        ? String((body as { title: string }).title).trim()
        : (cur as { title: string }).title;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ((body as { title?: string }).title !== undefined) patch.title = title;
    if ((body as { content?: string }).content !== undefined) {
      patch.content = String((body as { content: string }).content);
    }
    if ((body as { excerpt?: string }).excerpt !== undefined) {
      patch.excerpt = (body as { excerpt: string | null }).excerpt == null ? null : String((body as { excerpt: string }).excerpt);
    }
    if ((body as { cover_image?: string }).cover_image !== undefined) {
      const v = (body as { cover_image: string | null }).cover_image;
      patch.cover_image = v == null || !String(v).trim() ? null : String(v).trim();
    }
    if ((body as { category?: string }).category !== undefined) {
      const c = String((body as { category: string }).category ?? "Ανακοίνωση").trim() || "Ανακοίνωση";
      patch.category = c;
    }
    if ((body as { slug?: string }).slug !== undefined) {
      const s = String((body as { slug: string }).slug ?? "").trim() || slugifyNews(title);
      patch.slug = s;
    } else if ((body as { title?: string }).title !== undefined) {
      patch.slug = slugifyNews(title);
    }
    if ((body as { published?: boolean }).published !== undefined) {
      patch.published = nextPublished;
      if (nextPublished && !wasPublished) {
        patch.published_at = new Date().toISOString();
      }
    }
    const { data, error } = await supabase.from("news_posts").update(patch as never).eq("id", params.id).select("*").single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ post: data });
  } catch (e) {
    console.error("[api/news-posts id PUT]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!isCrmUser(profile) || !hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { error } = await supabase.from("news_posts").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/news-posts id DELETE]", e);
    return nextJsonError();
  }
}
