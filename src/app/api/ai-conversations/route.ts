import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { API_RACE_MS, withTimeoutQuery } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

type ConvRow = { id: string; title: string | null; updated_at: string | null };
type LastMsg = { content: string; created_at: string } | null;

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, supabase } = crm;

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

    const ids = list.map((c) => c.id);
    const lastById = new Map<string, LastMsg>();
    if (ids.length > 0) {
      const CHUNK = 20;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const part = ids.slice(i, i + CHUNK);
        const rows = await Promise.all(
          part.map(async (convId) => {
            const q = supabase
              .from("ai_messages")
              .select("content, created_at")
              .eq("conversation_id", convId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const { data: row, error: e } = await q;
            if (e || !row) return { convId, last: null as LastMsg };
            return {
              convId,
              last: { content: String(row.content ?? ""), created_at: String(row.created_at ?? "") },
            };
          }),
        );
        for (const { convId, last } of rows) {
          lastById.set(convId, last);
        }
      }
    }

    return NextResponse.json({
      conversations: list.map((c) => {
        const last = lastById.get(c.id);
        return {
          ...c,
          last_message_preview: last
            ? (() => {
                const raw = last.content.replace(/\s+/g, " ").trim();
                return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
              })()
            : null,
          last_message_at: last?.created_at ?? null,
        };
      }),
    });
  } catch {
    return NextResponse.json({ conversations: [] });
  }
}

export async function POST() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, supabase } = crm;

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
