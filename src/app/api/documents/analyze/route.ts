import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { anthropicComplete } from "@/lib/anthropic-once";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SYS =
  "Είσαι αναλυτής πολιτικών εγγράφων. Αναλύεις νόμους, ΦΕΚ, αιτήματα, άρθρα. Εστιάζεις πάντα στη σχέση με την Αιτωλοακαρνανία και τον βουλευτή Κώστα Καραγκούνη. Απαντάς με μόνο JSON object με κλειδιά: summary, key_points (array strings), relevance_to_aitoloakarnania, recommended_actions (array strings), sentiment (θετικό/ουδέτερο/μικτό/αρνητικό). Όλα στα ελληνικά.";

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as { text?: string; title?: string };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Κενό κείμενο" }, { status: 400 });
    }
    const title = String(body.title ?? "Έγγραφο");
    const userPrompt = `Τίτλος: ${title}\n\nΚείμενο (αποσπάσματα):\n${text.slice(0, 60_000)}`;
    const out = await anthropicComplete(
      SYS + " Επίστρεψε αυστηρά έγκυρο JSON object χωρίς markdown code fence.",
      userPrompt,
    );
    if (!out.ok) {
      return NextResponse.json({ error: out.error }, { status: 500 });
    }
    let parsed: Record<string, unknown> = { raw: out.text };
    try {
      const t = out.text.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "");
      parsed = JSON.parse(t) as Record<string, unknown>;
    } catch {
      parsed = {
        summary: out.text.slice(0, 2000),
        key_points: [],
        relevance_to_aitoloakarnania: "—",
        recommended_actions: [],
        sentiment: "—",
      };
    }
    return NextResponse.json({
      title,
      summary: String(parsed.summary ?? parsed["περίληψη"] ?? ""),
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      relevance_to_aitoloakarnania: String(parsed.relevance_to_aitoloakarnania ?? ""),
      recommended_actions: Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions : [],
      sentiment: String(parsed.sentiment ?? "—"),
      analysis: parsed,
    });
  } catch (e) {
    console.error("[api/documents/analyze]", e);
    return nextJsonError();
  }
}
