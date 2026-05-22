import { NextRequest, NextResponse } from "next/server";
import { requireAlexandraApi } from "@/lib/alexandra-api-access";
import { buildAlexandraExcel } from "@/lib/alexandra-files";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const access = await requireAlexandraApi();
  if (!access.ok) return access.response;

  let body: { data?: unknown; filename?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Άκυρο JSON" }, { status: 400 });
  }
  const filename = String(body.filename ?? "export").trim() || "export";

  try {
    const stored = await buildAlexandraExcel(access.user.id, body.data, filename);
    return NextResponse.json({ ok: true, ...stored });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα Excel";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
