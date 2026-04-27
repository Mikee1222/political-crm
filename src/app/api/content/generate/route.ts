import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { anthropicComplete } from "@/lib/anthropic-once";
import { nextJsonError } from "@/lib/api-resilience";
import { todayYmdAthens } from "@/lib/athens-ranges";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type GenType = "press_release" | "social_post" | "letter";

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as { type?: string; params?: Record<string, unknown> };
    const t = (body.type ?? "press_release") as GenType;
    const p = body.params ?? {};

    if (t === "press_release") {
      const topic = String(p.topic ?? "");
      const key_points = Array.isArray(p.key_points) ? (p.key_points as string[]).map(String) : [];
      const tone = String(p.tone ?? "επίσημο");
      const text = `Θέμα: ${topic}\nΤόνος: ${tone}\nΣημεία:\n${key_points.map((k, i) => `${i + 1}. ${k}`).join("\n")}`;
      const out = await anthropicComplete(
        "Σύνταξε ανακοίνωση τύπου στα ελληνικά για τον βουλευτή της Αιτωλοακαρνανίας. Μόνο το τελικό κείμενο.",
        text,
      );
      if (!out.ok) {
        return NextResponse.json({ error: out.error }, { status: 500 });
      }
      return NextResponse.json({ type: t, content: out.text });
    }
    if (t === "social_post") {
      const topic = String(p.topic ?? "");
      const platform = String(p.platform ?? "facebook");
      const tone = String(p.tone ?? "επίσημο");
      const hashtags = p.include_hashtags === true;
      const out = await anthropicComplete(
        `Δημιούργησε post για ${platform}, τόνος ${tone}, ελληνικά.${hashtags ? " Συμπλήρωσε hashtags." : " Χωρίς hashtags."} Σύντομο.`,
        topic,
      );
      if (!out.ok) {
        return NextResponse.json({ error: out.error }, { status: 500 });
      }
      return NextResponse.json({ type: t, content: out.text });
    }
    if (t === "letter") {
      const recipient = String(p.recipient_ministry ?? p.recipient ?? "Υπουργείο");
      const subject = String(p.subject ?? "");
      const issue = String(p.issue_description ?? "");
      const citizen = String(p.citizen_name ?? "");
      const letterType = String(p.letter_type ?? "αίτηση");
      const u = `Προς: ${recipient}\nΘέμα: ${subject}\nΖήτημα: ${issue}\nΠολίτης: ${citizen}\nΤύπος: ${letterType}\nΗμ.: ${todayYmdAthens()}`;
      const out = await anthropicComplete(
        "Έγγραψε επίσημη ελληνική επιστολή, πλήρες format. Υπογραφή: Κ. Καραγκούνης, Βουλευτής.",
        u,
      );
      if (!out.ok) {
        return NextResponse.json({ error: out.error }, { status: 500 });
      }
      return NextResponse.json({ type: t, content: out.text });
    }
    return NextResponse.json({ error: "Άκυρο type" }, { status: 400 });
  } catch (e) {
    console.error("[api/content/generate]", e);
    return nextJsonError();
  }
}
