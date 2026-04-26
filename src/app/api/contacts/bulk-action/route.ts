import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";
const schema = z.object({
  contact_ids: z.array(z.string()).min(1),
  action: z.enum(["update_status", "add_to_campaign", "delete"]),
  value: z.string().optional(),
});

const STATUSES = new Set(["Pending", "Positive", "Negative", "No Answer"]);

export async function POST(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
  }
  const { contact_ids, action, value } = parsed.data;

  if (action === "update_status") {
    if (!value || !STATUSES.has(value)) {
      return NextResponse.json({ error: "Άκυρη κατάσταση" }, { status: 400 });
    }
    const { error } = await supabase.from("contacts").update({ call_status: value }).in("id", contact_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, updated: contact_ids.length });
  }

  if (action === "add_to_campaign") {
    if (!value) return NextResponse.json({ error: "Άκυρη καμπάνια" }, { status: 400 });
    const { data: camp, error: e1 } = await supabase.from("campaigns").select("id, name").eq("id", value).maybeSingle();
    if (e1 || !camp) return NextResponse.json({ error: "Η καμπάνια δεν βρέθηκε" }, { status: 400 });
    const rows = contact_ids.map((contact_id) => ({ campaign_id: value, contact_id }));
    const { error: e2 } = await supabase.from("campaign_contacts").upsert(rows, { onConflict: "campaign_id,contact_id" });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
    return NextResponse.json({ ok: true, added: contact_ids.length, campaign: camp.name });
  }

  if (action === "delete") {
    if (profile?.role !== "admin") return forbidden();
    const admin = createServiceClient();
    const { error } = await admin.from("contacts").delete().in("id", contact_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, deleted: contact_ids.length });
  }

  return NextResponse.json({ error: "Άγνωστη ενέργεια" }, { status: 400 });
  } catch (e) {
    console.error("[api/contacts/bulk-action]", e);
    return nextJsonError();
  }
}
