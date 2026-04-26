import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
// API key: header `x-api-key` or query `?key=` (see requirePublicApiKey)
import { requirePublicApiKey } from "@/lib/public-api-auth";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";

export async function GET(request: NextRequest) {
  const authErr = requirePublicApiKey(request);
  if (authErr) return authErr;

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search");
  const callStatus = sp.get("call_status");
  const municipality = sp.get("municipality");
  const limitRaw = sp.get("limit");
  const limit = Math.min(Math.max(Number.parseInt(limitRaw ?? "20", 10) || 20, 1), 100);

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Ρύθμιση ελλιπής (SUPABASE_SERVICE_ROLE_KEY)" }, { status: 503 });
  }

  let query = supabase
    .from("contacts")
    .select("first_name, last_name, phone, municipality, call_status, nickname, area")
    .order("created_at", { ascending: false });

  if (callStatus) query = query.eq("call_status", callStatus);
  if (municipality) query = query.ilike("municipality", `%${municipality}%`);

  if (search?.trim()) {
    query = query.limit(12_000);
  } else {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let rows = data ?? [];
  if (search?.trim()) {
    rows = rows.filter((c) => contactMatchesFuzzyGreekSearch(c, search));
    rows = rows.slice(0, limit);
  }

  const contacts = rows.map((c) => ({
    name: `${c.first_name} ${c.last_name}`.trim(),
    phone: c.phone,
    municipality: c.municipality,
    call_status: c.call_status,
  }));

  return NextResponse.json({ contacts });
}

export const dynamic = "force-dynamic";
