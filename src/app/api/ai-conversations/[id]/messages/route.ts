import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionWithProfile } from "@/lib/auth-helpers";

const voicePostSchema = z.object({
  entries: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(50000),
      }),
    )
    .min(1)
    .max(200),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id: conversationId } = params;
  const { user, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  const { data: conv, error: cErr } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
  }

  const { data: messages, error: mErr } = await supabase
    .from("ai_messages")
    .select("id, role, content, action, context_label, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({ messages: messages ?? [] });
}

/** Persists a voice session transcript (ordered user/assistant turns) after the ElevenLabs call ends. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { id: conversationId } = params;
  const { user, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  let body: z.infer<typeof voicePostSchema>;
  try {
    const raw = await request.json();
    const parsed = voicePostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
  }

  const { data: conv, error: cErr } = await supabase
    .from("ai_conversations")
    .select("id, title")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
  }

  const { count: prior } = await supabase
    .from("ai_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  const isEmptyConv = (prior ?? 0) === 0;

  const { error: insErr } = await supabase.from("ai_messages").insert(
    body.entries.map((e) => ({
      conversation_id: conversationId,
      role: e.role,
      content: e.content.trim(),
      action: null,
      context_label: null,
    })),
  );
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const firstUser = body.entries.find((e) => e.role === "user");
  const newTitle = firstUser?.content.trim().slice(0, 50) || "Φωνητική συνομιλία";
  const needsTitle = isEmptyConv && (!conv.title || !String(conv.title).trim());

  await supabase
    .from("ai_conversations")
    .update({
      updated_at: new Date().toISOString(),
      ...(needsTitle ? { title: newTitle } : {}),
    })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
