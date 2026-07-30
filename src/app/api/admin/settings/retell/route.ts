import { NextRequest, NextResponse } from "next/server";
import { checkCRMAccess } from "@/lib/crm-api-access";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import { hasMinRole } from "@/lib/roles";
import { getVercelEnvConfig, upsertVercelEnvVar } from "@/lib/vercel-env";

export const dynamic = "force-dynamic";

const FIELD_TO_ENV: Record<string, string> = {
  retell_api_key: "RETELL_API_KEY",
  retell_agent_id: "RETELL_AGENT_ID",
  retell_from_number: "RETELL_FROM_NUMBER",
  retell_transfer_number: "RETELL_TRANSFER_NUMBER",
  retell_webhook_secret: "RETELL_WEBHOOK_SECRET",
};

function maskApiKey(value: string | undefined): string {
  if (!value) return "";
  return `sk-ret-****...${value.slice(-4)}`;
}

function maskAgentId(value: string | undefined): string {
  if (!value) return "";
  return `agent_****...${value.slice(-8)}`;
}

function maskWebhookSecret(value: string | undefined): string {
  if (!value) return "";
  return "****";
}

async function requireAdmin() {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return { error: crm.response as NextResponse };
  if (!hasMinRole(crm.profile?.role, "admin")) {
    return { error: forbidden() };
  }
  return { crm };
}

export async function GET() {
  try {
    const gate = await requireAdmin();
    if (gate.error) return gate.error;

    const apiKey = process.env.RETELL_API_KEY?.trim() ?? "";
    const agentId = process.env.RETELL_AGENT_ID?.trim() ?? "";
    const fromNumber = process.env.RETELL_FROM_NUMBER?.trim() ?? "";
    const transferNumber = process.env.RETELL_TRANSFER_NUMBER?.trim() ?? "";
    const webhookSecret = process.env.RETELL_WEBHOOK_SECRET?.trim() ?? "";

    return NextResponse.json({
      configured: Boolean(apiKey),
      retell_api_key: maskApiKey(apiKey),
      retell_agent_id: maskAgentId(agentId),
      retell_from_number: fromNumber,
      retell_transfer_number: transferNumber,
      retell_webhook_secret: maskWebhookSecret(webhookSecret),
    });
  } catch (e) {
    console.error("[api/admin/settings/retell GET]", e instanceof Error ? e.message : "error");
    return nextJsonError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requireAdmin();
    if (gate.error) return gate.error;

    const vercel = getVercelEnvConfig();
    if (!vercel.ok) {
      return NextResponse.json({ error: vercel.error }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: { envKey: string; value: string }[] = [];

    for (const [field, envKey] of Object.entries(FIELD_TO_ENV)) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const raw = body[field];
      if (raw === undefined || raw === null) continue;
      const value = String(raw).trim();
      if (!value) continue;
      // Ignore placeholders / unchanged masked values from the UI
      if (value.includes("****")) continue;
      updates.push({ envKey, value });
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "Δεν δόθηκαν πεδία προς ενημέρωση." },
        { status: 400 },
      );
    }

    for (const u of updates) {
      await upsertVercelEnvVar(vercel.token, vercel.projectId, u.envKey, u.value, vercel.teamId);
    }

    return NextResponse.json({
      ok: true,
      updated: updates.map((u) => u.envKey),
      message:
        "Αποθηκεύτηκε — απαιτείται redeploy για να ισχύσουν οι αλλαγές",
    });
  } catch (e) {
    console.error("[api/admin/settings/retell PATCH]", e instanceof Error ? e.message : "error");
    const msg = e instanceof Error ? e.message : "Σφάλμα ενημέρωσης Vercel";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
