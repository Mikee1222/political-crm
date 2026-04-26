import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { buildCreatePhoneCallBody } from "@/lib/retell-outbound";

const bodySchema = z.object({
  contact_id: z.string().uuid("Άκυρο contact_id"),
  campaign_id: z.string().uuid().optional().nullable(),
});

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!process.env.RETELL_API_KEY) {
    return NextResponse.json(
      { error: "Η Retell δεν έχει ρυθμιστεί (λείπει RETELL_API_KEY)" },
      { status: 503 },
    );
  }

  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors[0] ?? "Άκυρα δεδομένα" },
      { status: 400 },
    );
  }
  const { contact_id, campaign_id } = parsed.data;
  const phoneDigits = (s: string) => s.replace(/\D/g, "");

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, call_status")
    .eq("id", contact_id)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json(
      { error: "Η επαφή δεν βρέθηκε" },
      { status: 404 },
    );
  }
  const phone = (contact as { phone: string | null }).phone?.toString().trim() ?? "";
  if (!phone || phoneDigits(phone).length < 8) {
    return NextResponse.json(
      { error: "Η επαφή δεν έχει έγκυρο αριθμό τηλεφώνου" },
      { status: 400 },
    );
  }
  const first = String((contact as { first_name: string }).first_name || "").trim() || "Φίλε";

  let callBody: Record<string, unknown>;
  try {
    callBody = buildCreatePhoneCallBody(phone, first, contact_id, campaign_id ?? null);
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
    body: JSON.stringify(callBody),
  });

  const payload = (await retellRes.json().catch(() => ({}))) as { call_id?: string; [k: string]: unknown };
  if (!retellRes.ok) {
    return NextResponse.json(
      { error: "Η Retell απέρριψε την κλήση", detail: payload },
      { status: 400 },
    );
  }

  const { error: updError } = await supabase
    .from("contacts")
    .update({ call_status: "Pending" })
    .eq("id", contact_id);
  if (updError) {
    return NextResponse.json(
      { error: `Ενημέρωση επαφής απέτυχε: ${updError.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    success: true,
    call_id: typeof payload.call_id === "string" ? payload.call_id : null,
    retell: payload,
  });
}
