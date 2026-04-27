import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, isCrmUser, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { slugifyNews } from "@/lib/portal";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!isCrmUser(profile) || !hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("news_posts")
      .select("id, title, slug, published, published_at, category, excerpt, cover_image, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ posts: data ?? [] });
  } catch (e) {
    console.error("[api/news-posts GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!isCrmUser(profile) || !hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as {
      title: string;
      slug?: string;
      excerpt?: string;
      content: string;
      category?: string;
      cover_image?: string;
      published?: boolean;
    };
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Απαιτείται τίτλος" }, { status: 400 });
    }
    const content = String(body.content ?? "");
    if (!content) {
      return NextResponse.json({ error: "Απαιτείται περιεχόμενο" }, { status: 400 });
    }
    const published = Boolean(body.published);
    const published_at = published ? new Date().toISOString() : null;
    const baseSlug = String(body.slug ?? "").trim() || slugifyNews(title);
    let slug = baseSlug;
    for (let n = 0; n < 5; n++) {
      const trySlug = n === 0 ? slug : `${baseSlug}-${n + 1}`;
      const { data: existing, error: exE } = await supabase
        .from("news_posts")
        .select("id")
        .eq("slug", trySlug)
        .maybeSingle();
      if (exE) {
        return NextResponse.json({ error: exE.message }, { status: 400 });
      }
      if (!existing) {
        slug = trySlug;
        break;
      }
    }
    const { data, error } = await supabase
      .from("news_posts")
      .insert({
        title,
        slug,
        excerpt: body.excerpt != null ? String(body.excerpt) : null,
        content,
        category: String(body.category ?? "Ανακοίνωση").trim() || "Ανακοίνωση",
        cover_image: body.cover_image != null && String(body.cover_image).trim() ? String(body.cover_image).trim() : null,
        published,
        published_at,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      } as never)
      .select("id, title, slug, published, published_at, category, created_at, updated_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ post: data });
  } catch (e) {
    console.error("[api/news-posts POST]", e);
    return nextJsonError();
  }
}
