import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { buildContactsXlsxBuffer } from "@/lib/export-buffers";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const buf = await buildContactsXlsxBuffer();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="contacts.xlsx"',
      },
    });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
