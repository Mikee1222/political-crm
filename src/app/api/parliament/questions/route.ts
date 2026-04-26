import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

const SEL =
  "id, title, description, ministry, status, submitted_date, answer_date, answer_text, tags, related_contact_id, created_at";

export async function GET(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const sp = request.nextUrl.searchParams;
    const ministry = sp.get("ministry");
    const status = sp.get("status");
    const from = sp.get("date_from");
    const to = sp.get("date_to");
    let q = supabase
      .from("parliamentary_questions")
      .select(SEL)
      .order("submitted_date", { ascending: false, nullsFirst: false });
    if (ministry) {
      q = q.ilike("ministry", `%${ministry}%`);
    }
    if (status) {
      q = q.eq("status", status);
    }
    if (from) {
      q = q.gte("submitted_date", from);
    }
    if (to) {
      q = q.lte("submitted_date", to);
    }
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ questions: data ?? [] });
  } catch (e) {
    console.error("[parliament questions GET]", e);
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
      .from("parliamentary_questions")
      .insert({
        title: String(body.title),
        description: body.description != null ? String(body.description) : null,
        ministry: body.ministry != null ? String(body.ministry) : null,
        status: (body.status as string) || "Κατατέθηκε",
        submitted_date: body.submitted_date != null ? String(body.submitted_date) : null,
        answer_date: body.answer_date != null ? String(body.answer_date) : null,
        answer_text: body.answer_text != null ? String(body.answer_text) : null,
        tags: body.tags,
        related_contact_id: body.related_contact_id != null ? String(body.related_contact_id) : null,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[parliament questions POST]", e);
    return nextJsonError();
  }
}
