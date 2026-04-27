import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

type CsvRow = { first_name?: string; last_name?: string; phone?: string; area?: string };

export async function POST(request: Request) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Invalid file" }, { status: 400 });

  const text = await file.text();
  const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });

  const contacts = parsed.data
    .filter((row) => row.first_name && row.last_name && row.phone)
    .map((row) => ({
      first_name: row.first_name!.trim(),
      last_name: row.last_name!.trim(),
      phone: row.phone!.trim(),
      area: row.area?.trim() ?? null,
      call_status: "Pending",
      priority: "Medium",
    }));

  if (!contacts.length) return NextResponse.json({ inserted: 0 });

  const { error } = await supabase.from("contacts").insert(contacts);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ inserted: contacts.length });
  } catch (e) {
    console.error("[api/contacts/import]", e);
    return nextJsonError();
  }
}
