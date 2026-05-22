import { NextRequest, NextResponse } from "next/server";
import { checkCRMAccess } from "@/lib/crm-api-access";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

type ContactVcfRow = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone2: string | null;
  landline: string | null;
  email: string | null;
  address: string | null;
  municipality: string | null;
  birthday: string | null;
  occupation: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const crm = await checkCRMAccess(req);
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) return forbidden();

    const supabase = createServiceClient();

    const allContacts: ContactVcfRow[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "first_name, last_name, phone, phone2, landline, email, address, municipality, birthday, occupation",
        )
        .or("first_name.not.is.null,last_name.not.is.null")
        .not("first_name", "eq", "")
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (!data || data.length === 0) break;
      allContacts.push(...(data as ContactVcfRow[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const vcards = allContacts.map((c) => {
      const firstName = c.first_name ?? "";
      const lastName = c.last_name ?? "";
      const fullName = `${firstName} ${lastName}`.trim();

      let vcard = "BEGIN:VCARD\r\nVERSION:3.0\r\n";
      vcard += `FN:${fullName}\r\n`;
      vcard += `N:${lastName};${firstName};;;\r\n`;

      if (c.phone) vcard += `TEL;TYPE=CELL:${c.phone}\r\n`;
      if (c.phone2) vcard += `TEL;TYPE=CELL:${c.phone2}\r\n`;
      if (c.landline) vcard += `TEL;TYPE=HOME:${c.landline}\r\n`;
      if (c.email) vcard += `EMAIL:${c.email}\r\n`;
      if (c.address || c.municipality) {
        vcard += `ADR;TYPE=HOME:;;${c.address ?? ""};${c.municipality ?? ""};;;GR\r\n`;
      }
      if (c.birthday) vcard += `BDAY:${String(c.birthday).replace(/-/g, "")}\r\n`;
      if (c.occupation) vcard += `TITLE:${c.occupation}\r\n`;
      vcard += "ORG:Καραγκούνης CRM\r\n";
      vcard += "END:VCARD\r\n";

      return vcard;
    });

    const vcfContent = vcards.join("\r\n");
    const filename = `karagkounis-contacts-${new Date().toISOString().slice(0, 10)}.vcf`;

    return new NextResponse(vcfContent, {
      status: 200,
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": Buffer.byteLength(vcfContent, "utf8").toString(),
      },
    });
  } catch (e) {
    console.error("[api/contacts/export-vcf GET]", e);
    return nextJsonError();
  }
}
