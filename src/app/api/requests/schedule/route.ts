// Migration note: -- ALTER TABLE requests ADD COLUMN IF NOT EXISTS scheduled_date date;
import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** PATCH { request_id, scheduled_date } — YYYY-MM-DD */
export async function PATCH(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await request.json()) as { request_id?: string; scheduled_date?: string | null };
    const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "Απαιτείται request_id" }, { status: 400 });
    }

    let scheduledDate: string | null = null;
    if (body.scheduled_date != null && body.scheduled_date !== "") {
      const d = String(body.scheduled_date).trim();
      if (!DATE_RE.test(d)) {
        return NextResponse.json({ error: "Μη έγκυρη ημερομηνία (YYYY-MM-DD)" }, { status: 400 });
      }
      scheduledDate = d;
    }

    const { data: before, error: fetchErr } = await supabase
      .from("requests")
      .select("id, title, request_code, scheduled_date")
      .eq("id", requestId)
      .single();

    if (fetchErr || !before) {
      const msg = fetchErr?.message ?? "Δεν βρέθηκε";
      if (msg.includes("scheduled_date")) {
        return NextResponse.json(
          {
            error:
              "Η στήλη scheduled_date δεν υπάρχει ακόμα. Εκτελέστε το migration 20260522_requests_scheduled_date.sql στο Supabase.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: msg }, { status: fetchErr ? 400 : 404 });
    }

    const { data, error } = await supabase
      .from("requests")
      .update({
        scheduled_date: scheduledDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id, request_code, title, status, priority, category, scheduled_date, assigned_to, contact_id, created_at")
      .single();

    if (error) {
      if (error.message.includes("scheduled_date")) {
        return NextResponse.json(
          {
            error:
              "Η στήλη scheduled_date δεν υπάρχει ακόμα. Εκτελέστε το migration 20260522_requests_scheduled_date.sql στο Supabase.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const title = String((data as { title?: string }).title ?? "Αίτημα");
    const actor = firstNameFromFull(profile?.full_name);
    await logActivity({
      userId: user.id,
      action: "request_scheduled",
      entityType: "request",
      entityId: requestId,
      entityName: title,
      details: {
        actor_name: actor,
        scheduled_date: scheduledDate,
        previous_scheduled_date: (before as { scheduled_date?: string | null }).scheduled_date ?? null,
      },
    });

    return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/requests/schedule PATCH]", e);
    return nextJsonError();
  }
}
