import { NextRequest, NextResponse } from "next/server";
import { requireAlexandraApi } from "@/lib/alexandra-api-access";
import { buildAlexandraPdf } from "@/lib/alexandra-pdf";
import { storeAlexandraExport } from "@/lib/alexandra-storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const access = await requireAlexandraApi();
  if (!access.ok) return access.response;

  let body: { title?: string; content?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Άκυρο JSON" }, { status: 400 });
  }
  const title = String(body.title ?? "").trim() || "Έγγραφο";
  const content = String(body.content ?? "");
  const docType = body.type != null ? String(body.type).trim() : undefined;

  try {
    const buf = await buildAlexandraPdf(title, content, docType);
    const safeTitle = title.replace(/[^\w.\- ()\u0370-\u03FF]+/g, "_").slice(0, 80) || "document";
    const stored = await storeAlexandraExport(
      access.user.id,
      `${safeTitle}.pdf`,
      buf,
      "application/pdf",
    );
    return NextResponse.json({ ok: true, ...stored });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα PDF";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
