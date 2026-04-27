import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendWebPushToSubscription } from "@/lib/push-server";
import { nextJsonError } from "@/lib/api-resilience";
import type webpush from "web-push";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const b = (await request.json()) as { contact_id?: string; title?: string; body?: string };
    const contactId = String(b.contact_id ?? "").trim();
    if (!contactId) {
      return NextResponse.json({ error: "contact_id" }, { status: 400 });
    }
    const admin = createServiceClient();
    const { data: row } = await admin.from("portal_users").select("push_subscription").eq("contact_id", contactId).maybeSingle();
    const sub = (row as { push_subscription?: unknown } | null)?.push_subscription;
    if (!sub || typeof sub !== "object" || !("endpoint" in (sub as { endpoint?: string }))) {
      return NextResponse.json({ error: "Δεν υπάρχει εγγραφή push" }, { status: 400 });
    }
    const r = await sendWebPushToSubscription(
      sub as webpush.PushSubscription,
      { title: String(b.title ?? "Ειδοποίηση"), body: String(b.body ?? "") },
    );
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
