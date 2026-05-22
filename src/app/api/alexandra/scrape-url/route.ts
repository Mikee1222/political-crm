import { NextRequest, NextResponse } from "next/server";
import { requireAlexandraApi } from "@/lib/alexandra-api-access";
import { scrapePublicUrl } from "@/lib/alexandra-scrape";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const access = await requireAlexandraApi();
  if (!access.ok) return access.response;

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Άκυρο JSON" }, { status: 400 });
  }
  const url = String(body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "Χρειάζεται url" }, { status: 400 });
  }

  try {
    const result = await scrapePublicUrl(url);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Σφάλμα ανάγνωσης URL";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
