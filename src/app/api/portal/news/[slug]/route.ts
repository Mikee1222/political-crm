import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase/anon";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  try {
    const slug = params.slug;
    if (!slug) {
      return NextResponse.json({ error: "Λάθος slug" }, { status: 400 });
    }
    const { data: post, error: e1 } = await supabaseAnon
      .from("news_posts")
      .select("id, title, slug, excerpt, content, cover_image, category, published_at, created_at, tags")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();
    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 400 });
    }
    if (!post) {
      return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
    }
    const { data: related, error: e2 } = await supabaseAnon
      .from("news_posts")
      .select("id, title, slug, excerpt, cover_image, category, published_at")
      .eq("published", true)
      .eq("category", (post as { category: string }).category)
      .neq("id", (post as { id: string }).id)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(3);
    if (e2) {
      return NextResponse.json({ post, related: [] });
    }
    return NextResponse.json({ post, related: related ?? [] });
  } catch (e) {
    console.error("[api/portal/news/slug GET]", e);
    return nextJsonError();
  }
}
