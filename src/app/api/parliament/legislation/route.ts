import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const q = request.nextUrl.searchParams.get("q");
    let query = supabase
      .from("legislation")
      .select("id, title, description, law_number, status, vote, date, ministry, impact_description, url, created_at")
      .order("date", { ascending: false, nullsFirst: false });
    if (q && q.trim()) {
      const t = q.trim();
      query = query.or(`title.ilike.%${t}%,law_number.ilike.%${t}%`);
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("[legislation GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (!String(body.title ?? "").trim()) {
      return NextResponse.json({ error: "Υποχρεωτικό title" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("legislation")
      .insert({
        title: String(body.title),
        description: body.description != null ? String(body.description) : null,
        law_number: body.law_number != null ? String(body.law_number) : null,
        status: (body.status as string) || "Υπό Εξέταση",
        vote: body.vote != null ? String(body.vote) : null,
        date: body.date != null ? String(body.date) : null,
        ministry: body.ministry != null ? String(body.ministry) : null,
        impact_description: body.impact_description != null ? String(body.impact_description) : null,
        url: body.url != null ? String(body.url) : null,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[legislation POST]", e);
    return nextJsonError();
  }
}
