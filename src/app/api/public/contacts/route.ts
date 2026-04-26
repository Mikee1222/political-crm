import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
// API key: header `x-api-key` or query `?key=` (see requirePublicApiKey)
import { requirePublicApiKey } from "@/lib/public-api-auth";
import { contactMatchesFuzzyGreekSearch } from "@/lib/greek-fuzzy-name";

const toUndef = (v: unknown) => {
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
};

const publicContactPostSchema = z
  .object({
    first_name: z.string().max(200).transform((s) => s.trim()).pipe(z.string().min(1)),
    last_name: z.string().max(200).transform((s) => s.trim()).pipe(z.string().min(1)),
    phone: z.string().max(50).transform((s) => s.trim()).pipe(z.string().min(1)),
    municipality: z.preprocess(toUndef, z.string().max(500).optional()),
    area: z.preprocess(toUndef, z.string().max(500).optional()),
    political_stance: z.preprocess(toUndef, z.string().max(200).optional()),
    notes: z.preprocess(toUndef, z.string().max(20000).optional()),
    email: z.preprocess(toUndef, z.string().max(500).email().optional()),
  })
  .strict();

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

export async function POST(request: NextRequest) {
  const authErr = requirePublicApiKey(request);
  if (authErr) return authErr;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Ρύθμιση ελλιπής (SUPABASE_SERVICE_ROLE_KEY)" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
  }

  const parsed = publicContactPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Άκυρα πεδία", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const v = parsed.data;
  const row = {
    first_name: v.first_name,
    last_name: v.last_name,
    phone: v.phone,
    municipality: v.municipality ?? null,
    area: v.area ?? null,
    political_stance: v.political_stance ?? null,
    notes: v.notes ?? null,
    email: v.email ?? null,
  };

  const { data, error } = await supabase.from("contacts").insert(row).select("id").single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data?.id) {
    return NextResponse.json({ error: "Άκυρη απάντηση" }, { status: 500 });
  }

  return NextResponse.json({ success: true, contact_id: data.id });
}

export const dynamic = "force-dynamic";
