import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { generateSummaryText, readCachedSummary } from "@/lib/ai-summary";
import { fetchRequestSummaryPack } from "@/lib/ai-summary-request-data";
import { REQUEST_SUMMARY_SYSTEM } from "@/lib/ai-summary-prompts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const { data: row, error } = await supabase
      .from("requests")
      .select("id, ai_summary, ai_summary_updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.warn("[request ai-summary GET]", error.message);
      return NextResponse.json({ cached: false });
    }
    if (!row) {
      return NextResponse.json({ cached: false });
    }
    return NextResponse.json(readCachedSummary(row) ?? { cached: false });
  } catch (e) {
    console.error("[request ai-summary GET]", e);
    return NextResponse.json({ cached: false });
  }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const pack = await fetchRequestSummaryPack(supabase, id);
    if (!pack) {
      return NextResponse.json({ error: "Δεν βρέθηκε το αίτημα" }, { status: 404 });
    }

    const generated = await generateSummaryText(REQUEST_SUMMARY_SYSTEM, pack.prompt);
    if (!generated.ok) {
      return NextResponse.json({ error: generated.error, summary: `Σφάλμα: ${generated.error}` }, { status: 503 });
    }

    const now = new Date().toISOString();
    const { error: up } = await supabase
      .from("requests")
      .update({ ai_summary: generated.summary, ai_summary_updated_at: now })
      .eq("id", id);
    if (up) {
      return NextResponse.json({ error: up.message }, { status: 400 });
    }
    return NextResponse.json({ summary: generated.summary, cached: false, updated_at: now });
  } catch (e) {
    console.error("[request ai-summary POST]", e);
    return nextJsonError();
  }
}
