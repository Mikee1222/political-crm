import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { hasPermissionFlexible } from "@/lib/permission-check";
import { nextJsonError } from "@/lib/api-resilience";
import { generateSummaryText, readCachedSummary } from "@/lib/ai-summary";
import { CONTACT_SUMMARY_SYSTEM, fetchContactSummaryPack } from "@/lib/ai-summary-prompts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase, user } = crm;
    const canViewAiSummary = await hasPermissionFlexible(
      user.id,
      "ai_summary_view",
      hasMinRole(profile?.role, "manager", profile?.access_tier),
    );
    if (!canViewAiSummary) return forbidden();

    const { data: c, error } = await supabase
      .from("contacts")
      .select("id, ai_summary, ai_summary_updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.warn("[ai-summary GET]", error.message);
      return NextResponse.json({ cached: false });
    }
    if (!c) {
      return NextResponse.json({ cached: false });
    }
    return NextResponse.json(readCachedSummary(c) ?? { cached: false });
  } catch (e) {
    console.error("[ai-summary GET]", e);
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
    const { profile, supabase, user } = crm;
    const canViewAiSummary = await hasPermissionFlexible(
      user.id,
      "ai_summary_view",
      hasMinRole(profile?.role, "manager", profile?.access_tier),
    );
    if (!canViewAiSummary) return forbidden();

    const pack = await fetchContactSummaryPack(supabase, id);
    if (!pack) {
      return NextResponse.json({ error: "Άγνωστη επαφή" }, { status: 404 });
    }

    const generated = await generateSummaryText(CONTACT_SUMMARY_SYSTEM, pack.prompt);
    if (!generated.ok) {
      return NextResponse.json({ error: generated.error }, { status: 503 });
    }

    const now = new Date().toISOString();
    const { error: up } = await supabase
      .from("contacts")
      .update({ ai_summary: generated.summary, ai_summary_updated_at: now })
      .eq("id", id);
    if (up) {
      return NextResponse.json({ error: up.message }, { status: 400 });
    }
    return NextResponse.json({ summary: generated.summary, cached: false, updated_at: now });
  } catch (e) {
    console.error("[ai-summary POST]", e);
    return nextJsonError();
  }
}
