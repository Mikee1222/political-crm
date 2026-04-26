import { NextResponse } from "next/server";
import { API_RACE_MS, withTimeoutQuery } from "@/lib/api-resilience";
import { getSessionWithProfile } from "@/lib/auth-helpers";
export const dynamic = 'force-dynamic';


type ConvRow = { id: string; title: string | null; updated_at: string | null };

export async function GET() {
  try {
    const { user, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }

    const q = supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    const raced = await withTimeoutQuery<{
      data: ConvRow[] | null;
      error: { message: string } | null;
    }>(q, API_RACE_MS);
    if (raced === "timeout") {
      return NextResponse.json({ conversations: [] });
    }

    const { data, error } = raced;
    if (error) {
      return NextResponse.json({ conversations: [] });
    }

    const list = (data ?? []).map((r: ConvRow) => ({
      id: r.id,
      title: r.title && String(r.title).trim() ? r.title : "Νέα συνομιλία",
      updated_at: r.updated_at,
    }));

    return NextResponse.json({ conversations: list });
  } catch {
    return NextResponse.json({ conversations: [] });
  }
}

export async function POST() {
  try {
    const { user, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }

    const q = supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, title: null as string | null })
      .select("id, title")
      .single();

    const raced = await withTimeoutQuery<{
      data: { id: string; title: string | null } | null;
      error: { message: string } | null;
    }>(q, API_RACE_MS);
    if (raced === "timeout") {
      return NextResponse.json({ error: "Λήξη χρόνου" }, { status: 503 });
    }

    const { data, error } = raced;
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Σφάλμα" }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      title: data.title?.trim() ? data.title : "Νέα συνομιλία",
    });
  } catch {
    return NextResponse.json({ error: "Σφάλμα" }, { status: 500 });
  }
}
