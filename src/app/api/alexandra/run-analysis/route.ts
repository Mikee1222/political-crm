import { NextRequest, NextResponse } from "next/server";
import { requireAlexandraApi } from "@/lib/alexandra-api-access";
import { runAlexandraAnalysis } from "@/lib/alexandra-analysis";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const access = await requireAlexandraApi();
  if (!access.ok) return access.response;

  let body: { type?: string; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Άκυρο JSON" }, { status: 400 });
  }
  const type = String(body.type ?? "").trim();
  if (!type) {
    return NextResponse.json({ error: "Χρειάζεται type" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const result = await runAlexandraAnalysis(supabase, type, body.data);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα ανάλυσης";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
