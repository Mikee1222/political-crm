import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export type ToponymListRow = {
  id: string;
  name: string;
};

export type ToponymWithCountRow = ToponymListRow & {
  contact_count: number;
  municipality_id?: string;
  municipality_name?: string | null;
  electoral_district_id?: string | null;
  electoral_district_name?: string | null;
};

function isToponymListRow(value: unknown): value is ToponymListRow {
  if (typeof value !== "object" || value === null) return false;

  const row = value as { id?: unknown; name?: unknown };
  return typeof row.id === "string" && typeof row.name === "string";
}

export async function GET(request: Request) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const withCounts = new URL(request.url).searchParams.get("with_counts") === "1";
    if (withCounts) {
      const { data: counts, error: cErr } = await supabase.rpc("get_contact_toponym_counts");
      if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 400 });
      }

      const ids = ((counts as { id?: string }[] | null) ?? []).map((r) => r.id).filter(Boolean) as string[];
      if (ids.length === 0) {
        return NextResponse.json({ toponyms: [] as ToponymWithCountRow[] });
      }

      const { data: tops, error: tErr } = await supabase
        .from("toponyms")
        .select("id, name, municipality_id, electoral_district_id")
        .in("id", ids);
      if (tErr) {
        return NextResponse.json({ error: tErr.message }, { status: 400 });
      }

      const [{ data: munis }, { data: eds }] = await Promise.all([
        supabase.from("municipalities").select("id, name"),
        supabase.from("electoral_districts").select("id, name"),
      ]);
      const mMap = new Map((munis as { id: string; name: string }[] | null)?.map((m) => [m.id, m.name]) ?? []);
      const dMap = new Map((eds as { id: string; name: string }[] | null)?.map((m) => [m.id, m.name]) ?? []);
      const countMap = new Map(
        ((counts as { id?: string; contact_count?: number | string }[] | null) ?? []).map((r) => [
          String(r.id ?? ""),
          Number(r.contact_count ?? 0),
        ]),
      );
      const topMap = new Map(
        ((tops ?? []) as { id: string; name: string; municipality_id: string; electoral_district_id: string | null }[]).map(
          (t) => [t.id, t],
        ),
      );

      const toponyms: ToponymWithCountRow[] = ids
        .flatMap((id) => {
          const t = topMap.get(id);
          if (!t) return [];
          const row: ToponymWithCountRow = {
            id: t.id,
            name: t.name.trim(),
            contact_count: countMap.get(id) ?? 0,
            municipality_id: t.municipality_id,
            municipality_name: mMap.get(t.municipality_id) ?? null,
            electoral_district_id: t.electoral_district_id,
            electoral_district_name: t.electoral_district_id ? (dMap.get(t.electoral_district_id) ?? null) : null,
          };
          return [row];
        })
        .sort((a, b) => a.name.localeCompare(b.name, "el"));

      return NextResponse.json({ toponyms });
    }

    const allToponyms: ToponymListRow[] = [];
    let from = 0;
    const batchSize = 500;

    while (true) {
      const { data, error } = await supabase
        .from("toponyms")
        .select("id, name")
        .not("name", "is", null)
        .order("name", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (!data || data.length === 0) break;

      for (const row of data) {
        if (!isToponymListRow(row)) {
          throw new Error("Invalid toponym row returned from database");
        }

        allToponyms.push({ ...row, name: row.name.trim() });
      }

      if (data.length < batchSize) break;
      from += batchSize;
    }

    const clean = allToponyms.filter((t) => t.name && t.name.trim().length > 2);

    return NextResponse.json(clean);
  } catch (e) {
    console.error("[api/toponyms GET]", e);
    return nextJsonError();
  }
}
