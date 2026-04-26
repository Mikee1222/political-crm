import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("parliamentary_questions")
      .select(
        "id, title, description, ministry, status, submitted_date, answer_date, answer_text, tags, related_contact_id, created_at",
      )
      .eq("id", params.id)
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    let contact = null;
    if (data && (data as { related_contact_id?: string | null }).related_contact_id) {
      const { data: c } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, phone")
        .eq("id", (data as { related_contact_id: string }).related_contact_id)
        .maybeSingle();
      contact = c;
    }
    return NextResponse.json({ question: data, contact });
  } catch (e) {
    console.error("[parliament questions id GET]", e);
    return nextJsonError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as Record<string, unknown>;
    const { data, error } = await supabase
      .from("parliamentary_questions")
      .update(body)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ question: data });
  } catch (e) {
    console.error("[parliament questions id PATCH]", e);
    return nextJsonError();
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const { error } = await supabase.from("parliamentary_questions").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[parliament questions id DELETE]", e);
    return nextJsonError();
  }
}
