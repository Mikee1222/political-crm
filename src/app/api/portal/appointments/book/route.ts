import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCalendarClientForUser, getAppointmentCalendarUserId } from "@/lib/google-calendar";
import { getAvailableSlotsForDate } from "@/lib/appointment-slots";
import { EmailTemplates, sendResendEmail, getPublicBaseUrl } from "@/lib/email";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  contact_id: z.string().uuid(),
  phone: z.string().min(8),
  name: z.string().min(2),
  reason: z.string().min(3).max(2000),
  start: z.string().min(10),
  end: z.string().min(10),
});

function normPhone(s: string) {
  return s.replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const { contact_id, phone, name, reason, start, end } = parsed.data;
    const admin = createServiceClient();
    const { data: c, error: ce } = await admin
      .from("contacts")
      .select("id, phone, first_name, last_name, email")
      .eq("id", contact_id)
      .maybeSingle();
    if (ce || !c) {
      return NextResponse.json({ error: "Άγνωστη επαφή" }, { status: 404 });
    }
    const cPhone = normPhone((c as { phone: string | null }).phone ?? "");
    if (!cPhone || cPhone !== normPhone(phone)) {
      return NextResponse.json({ error: "Το τηλέφωνο δεν ταιριάζει με την επαφή" }, { status: 400 });
    }

    const day = start.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return NextResponse.json({ error: "Άκυρη ώρα" }, { status: 400 });
    }
    const avail = await getAvailableSlotsForDate(day);
    if (!avail.ok) {
      return NextResponse.json({ error: "Μη διαθέσιμο ημερολόγιο" }, { status: 503 });
    }
    const allowed = avail.slots.some((s) => s.start === start && s.end === end);
    if (!allowed) {
      return NextResponse.json({ error: "Η θέση δεν είναι πλέον ελεύθερη" }, { status: 409 });
    }

    const calUser = await getAppointmentCalendarUserId();
    if (!calUser) {
      return NextResponse.json({ error: "Ημερολόγιο μη συνδεδεμένο" }, { status: 503 });
    }
    const cal = await getCalendarClientForUser(calUser);
    if (!cal) {
      return NextResponse.json({ error: "Ημερολόγιο μη συνδεδεμένο" }, { status: 503 });
    }
    const title = `Ραντεβού (Portal): ${name}`;
    const ins = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description: `Αίτημα πολίτη: ${reason}\nΕπαφή CRM: ${contact_id}\nΤηλ.: ${phone}`,
        start: { dateTime: start, timeZone: "Europe/Athens" },
        end: { dateTime: end, timeZone: "Europe/Athens" },
        extendedProperties: {
          private: { crmType: "portal_appointment" },
        } as { private: Record<string, string> },
      },
    });
    const eid = ins.data.id ?? "";

    const { error: apErr } = await admin.from("office_appointments").insert({
      contact_id,
      starts_at: start,
      ends_at: end,
      citizen_name: name,
      citizen_phone: phone,
      reason,
      google_event_id: eid,
    } as never);
    if (apErr) {
      console.error("[office_appointments]", apErr.message);
    }

    const email = (c as { email: string | null }).email;
    if (email?.includes("@")) {
      const t = new Date(start);
      const whenLabel = t.toLocaleString("el-GR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Athens",
      });
      const tpl = EmailTemplates.appointmentConfirmation(whenLabel, reason);
      void sendResendEmail({
        to: email,
        subject: tpl.subj,
        html: tpl.html,
        template: "appointment",
        contact_id,
      });
    } else {
      const tpl = EmailTemplates.appointmentConfirmation(
        new Date(start).toLocaleString("el-GR", { timeZone: "Europe/Athens" }),
        reason,
      );
      const adminEmail = process.env.ADMIN_EMAIL?.trim();
      if (adminEmail) {
        void sendResendEmail({
          to: adminEmail,
          subject: `[Ραντεβού] ${name}`,
          html: `${tpl.html}<p>Χωρίς email πολίτη· ειδοποίηση στο γραφείο.</p>`,
          template: "appointment_notice",
        });
      }
    }

    return NextResponse.json({ ok: true, event_id: eid, public_url: getPublicBaseUrl() });
  } catch (e) {
    console.error("[portal/appointments/book]", e);
    return nextJsonError();
  }
}
