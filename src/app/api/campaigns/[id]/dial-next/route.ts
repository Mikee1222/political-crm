import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { buildCreatePhoneCallBody } from "@/lib/retell-outbound";

/**
 * Dials the next contact in the campaign (first assigned contact with no call yet in this campaign).
 */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const campaignId = params.id;

  const { data: assigned, error: aErr } = await supabase
    .from("campaign_contacts")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .order("added_at", { ascending: true });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });
  const ordered = (assigned ?? [])
    .map((r: { contact_id: string }) => r.contact_id)
    .filter(Boolean) as string[];
  if (ordered.length === 0) {
    return NextResponse.json(
      { error: "Η καμπάνια δεν έχει ανατεθειμένες επαφές" },
      { status: 400 },
    );
  }

  const { data: callRows, error: cErr } = await supabase
    .from("calls")
    .select("contact_id")
    .eq("campaign_id", campaignId);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
  const called = new Set(
    (callRows ?? [])
      .map((r: { contact_id: string | null }) => r.contact_id)
      .filter(Boolean) as string[],
  );

  let nextId: string | null = null;
  for (const id of ordered) {
    if (!called.has(id)) {
      nextId = id;
      break;
    }
  }
  if (!nextId) {
    return NextResponse.json(
      { error: "Έχετε κληθεί όλες οι επαφές της καμπάνιας" },
      { status: 400 },
    );
  }

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, first_name, phone")
    .eq("id", nextId)
    .single();
  if (contactErr || !contact) {
    return NextResponse.json({ error: "Η επαφή δεν βρέθηκε" }, { status: 404 });
  }
  if (!process.env.RETELL_API_KEY) {
    return NextResponse.json(
      { error: "Η Retell δεν έχει ρυθμιστεί" },
      { status: 503 },
    );
  }
  let retellBody: Record<string, unknown>;
  try {
    retellBody = buildCreatePhoneCallBody(
      (contact as { phone: string }).phone,
      String((contact as { first_name: string }).first_name || ""),
      (contact as { id: string }).id,
      campaignId,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ρύθμιση Retell" },
      { status: 503 },
    );
  }
  const retellRes = await fetch("https://api.retellai.com/v2/create-phone-call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(retellBody),
  });
  const payload = await retellRes.json();
  if (!retellRes.ok) return NextResponse.json({ error: payload }, { status: 400 });

  await supabase.from("contacts").update({ call_status: "Pending" }).eq("id", nextId);

  return NextResponse.json({
    success: true,
    contact_id: nextId,
    retell: payload,
  });
}
