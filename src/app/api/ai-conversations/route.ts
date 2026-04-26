import { NextResponse } from "next/server";
import { getSessionWithProfile } from "@/lib/auth-helpers";

export async function GET() {
  const { user, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (data ?? []).map((r) => ({
    id: r.id,
    title: (r.title && String(r.title).trim()) ? r.title : "Νέα συνομιλία",
    updated_at: r.updated_at,
  }));

  return NextResponse.json({ conversations: list });
}

export async function POST() {
  const { user, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: user.id, title: null as string | null })
    .select("id, title")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Σφάλμα" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    title: data.title?.trim() ? data.title : "Νέα συνομιλία",
  });
}

export const dynamic = "force-dynamic";
