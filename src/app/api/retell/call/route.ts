import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }

  const { contact_id } = await request.json();
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id, first_name, phone")
    .eq("id", contact_id)
    .single();

  if (error || !contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const retellRes = await fetch("https://api.retellai.com/v2/create-phone-call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_number: process.env.RETELL_FROM_NUMBER,
      to_number: contact.phone,
      override_agent_id: process.env.RETELL_AGENT_ID,
      retell_llm_dynamic_variables: { first_name: contact.first_name, contact_id: contact.id },
    }),
  });

  const payload = await retellRes.json();
  if (!retellRes.ok) return NextResponse.json({ error: payload }, { status: 400 });

  return NextResponse.json({ success: true, retell: payload });
}
