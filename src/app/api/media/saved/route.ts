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
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("media_saved_articles")
      .select("id, title, source, link, published_at, snippet, query, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("[media/saved GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const b = (await request.json()) as {
      title?: string;
      source?: string;
      link?: string;
      published_at?: string;
      snippet?: string;
      query?: string;
    };
    const { data, error } = await supabase
      .from("media_saved_articles")
      .insert({
        title: String(b.title ?? "Άνευ τίτλου"),
        source: b.source ?? null,
        link: b.link ?? null,
        published_at: b.published_at ?? null,
        snippet: b.snippet ?? null,
        query: b.query ?? null,
        user_id: user.id,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[media/saved POST]", e);
    return nextJsonError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id" }, { status: 400 });
    }
    const { error } = await supabase.from("media_saved_articles").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[media/saved DELETE]", e);
    return nextJsonError();
  }
}
