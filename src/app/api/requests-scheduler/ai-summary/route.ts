import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { generateSummaryText, readCachedSummary } from "@/lib/ai-summary";
import { fetchRequestSummaryPack } from "@/lib/ai-summary-request-data";
import { REQUEST_SUMMARY_SYSTEM } from "@/lib/ai-summary-prompts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const crm = await checkCRMAccess(req);
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const requestId = req.nextUrl.searchParams.get("requestId")?.trim() ?? "";
    if (!requestId) {
      return NextResponse.json({ error: "Απαιτείται requestId" }, { status: 400 });
    }

    const { data: row, error } = await supabase
      .from("requests")
      .select("id, ai_summary, ai_summary_updated_at")
      .eq("id", requestId)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ summary: null, cached: false, updated_at: null });
    }
    return NextResponse.json(readCachedSummary(row));
  } catch (err) {
    console.error("[ai-summary GET]", err);
    return NextResponse.json({ summary: null, cached: false, updated_at: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const crm = await checkCRMAccess(req);
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await req.json()) as { requestId?: string };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "Απαιτείται requestId" }, { status: 400 });
    }

    const pack = await fetchRequestSummaryPack(supabase, requestId);
    if (!pack) {
      return NextResponse.json({ error: "Δεν βρέθηκε το αίτημα" }, { status: 404 });
    }

    const schedulerPrompt = `${pack.prompt}

ΠΡΟΣΘΕΤΕΣ ΟΔΗΓΙΕΣ (προγραμματιστής αιτημάτων):
Δώσε ΟΛΟΚΛΗΡΩΜΕΝΗ σύνοψη 4-6 προτάσεων για γρήγορη απόφαση προγραμματισμού.
Τόνισε προτεραιότητα, SLA, κατάσταση πολίτη και αν χρειάζεται άμεση δράση.`;

    const generated = await generateSummaryText(REQUEST_SUMMARY_SYSTEM, schedulerPrompt);
    if (!generated.ok) {
      console.error("[ai-summary] Anthropic failed:", generated.error);
      return NextResponse.json(
        {
          error: generated.error,
          summary: `Σφάλμα: ${generated.error}`,
        },
        { status: 503 },
      );
    }

    const now = new Date().toISOString();
    const { error: up } = await supabase
      .from("requests")
      .update({ ai_summary: generated.summary, ai_summary_updated_at: now })
      .eq("id", requestId);
    if (up) {
      return NextResponse.json({ error: up.message }, { status: 400 });
    }

    return NextResponse.json({ summary: generated.summary, cached: false, updated_at: now });
  } catch (err) {
    console.error("AI Summary error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message,
        summary: `Σφάλμα: ${message}`,
      },
      { status: 500 },
    );
  }
}
