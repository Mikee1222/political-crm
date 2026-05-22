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

    const adminSupabase = createServiceClient();

    let allContacts: ContactVcfRow[] = [];
    let from = 0;
    const pageSize = 5000;
    let keepGoing = true;

    while (keepGoing) {
      const { data, error } = await adminSupabase
        .from("contacts")
        .select(
          "first_name, last_name, phone, phone2, landline, email, address, municipality, birthday, occupation",
        )
        .or("first_name.neq.,last_name.neq.")
        .range(from, from + pageSize - 1)
        .order("id");

      if (error) {
        console.error("Fetch error at range", from, error);
        break;
      }

      if (!data || data.length === 0) {
        keepGoing = false;
        break;
      }

      const valid = data.filter(
        (c) =>
          (c.first_name && c.first_name.trim() !== "") ||
          (c.last_name && c.last_name.trim() !== ""),
      ) as ContactVcfRow[];

      allContacts = allContacts.concat(valid);
      console.log(`Fetched ${allContacts.length} so far (page from=${from})`);

      if (data.length < pageSize) {
        keepGoing = false;
      } else {
        from += pageSize;
      }
    }

    console.log(`Total contacts to export: ${allContacts.length}`);

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
