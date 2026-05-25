import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export type ToponymListRow = {
  id: string;
  name: string;
};

function isToponymListRow(value: unknown): value is ToponymListRow {
  if (typeof value !== "object" || value === null) return false;

  const row = value as { id?: unknown; name?: unknown };
  return typeof row.id === "string" && typeof row.name === "string";
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { supabase } = crm;

    const allToponyms: ToponymListRow[] = [];
    let from = 0;
    const batchSize = 500;

    while (true) {
      const { data, error } = await supabase
        .from("toponyms")
        .select("id, name")
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

        allToponyms.push(row);
      }

      if (data.length < batchSize) break;
      from += batchSize;
    }

    return NextResponse.json(allToponyms);
  } catch (e) {
    console.error("[api/toponyms GET]", e);
    return nextJsonError();
  }
}
