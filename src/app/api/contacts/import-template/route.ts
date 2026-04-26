import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";

export function GET() {
  try {
  const csv =
    "first_name,last_name,phone,email,area,municipality,electoral_district,toponym,political_stance,notes\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="contacts-template.csv"',
    },
  });
  } catch (e) {
    console.error("[api/contacts/import-template]", e);
    return nextJsonError();
  }
}
