import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
  const { id } = params;
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, supabase } = crm;

  const { data: row, error: fErr } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fErr) {
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Δεν βρέθηκε" }, { status: 404 });
  }

  const { error: dErr } = await supabase.from("ai_conversations").delete().eq("id", id);
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/ai-conversations/id]", e);
    return nextJsonError();
  }
}

