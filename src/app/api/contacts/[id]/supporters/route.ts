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
      .from("supporters")
      .select("id, support_type, amount, date, notes, created_at")
      .eq("contact_id", params.id)
      .order("date", { ascending: false, nullsFirst: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("[supporters GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const b = (await request.json()) as {
      support_type?: string;
      amount?: number | string;
      date?: string;
      notes?: string;
    };
    const { data, error } = await supabase
      .from("supporters")
      .insert({
        contact_id: params.id,
        support_type: b.support_type ?? null,
        amount: b.amount != null && b.amount !== "" ? Number(b.amount) : null,
        date: b.date != null ? String(b.date) : null,
        notes: b.notes != null ? String(b.notes) : null,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[supporters POST]", e);
    return nextJsonError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const sid = request.nextUrl.searchParams.get("id");
    if (!sid) {
      return NextResponse.json({ error: "id" }, { status: 400 });
    }
    const { error } = await supabase
      .from("supporters")
      .delete()
      .eq("id", sid)
      .eq("contact_id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[supporters DELETE]", e);
    return nextJsonError();
  }
}
