import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { retellOutcomeLabel } from "@/lib/retell-call-outcomes";
import { formatDurationGreek } from "@/lib/campaign-contact-status";
import { pickCampaignDialPhone } from "@/lib/campaign-contact-phone";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "manager")) {
      return forbidden();
    }

    const { data: camp, error: campErr } = await crm.supabase
      .from("campaigns")
      .select("id, name")
      .eq("id", params.id)
      .maybeSingle();
    if (campErr || !camp) {
      return NextResponse.json({ error: "Καμπάνια δεν βρέθηκε" }, { status: 404 });
    }

    const { data, error } = await crm.supabase
      .from("calls")
      .select(
        "id, called_at, outcome, duration_seconds, transferred_to_politician, contact_id, contacts(first_name, last_name, phone, phone2, landline)",
      )
      .eq("campaign_id", params.id)
      .order("called_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    type Row = {
      id: string;
      called_at: string | null;
      outcome: string | null;
      duration_seconds: number | null;
      transferred_to_politician: boolean | null;
      contact_id: string;
      contacts:
        | {
            first_name: string | null;
            last_name: string | null;
            phone: string | null;
            phone2: string | null;
            landline: string | null;
          }
        | {
            first_name: string | null;
            last_name: string | null;
            phone: string | null;
            phone2: string | null;
            landline: string | null;
          }[]
        | null;
    };

    const aoa: (string | number)[][] = [
      [
        "Επαφή",
        "Τηλέφωνο",
        "Αποτέλεσμα",
        "Διάρκεια (δευτ.)",
        "Διάρκεια",
        "Ημερομηνία",
        "Transfer",
        "Contact ID",
      ],
    ];
    for (const r of (data ?? []) as Row[]) {
      const cont = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      const name = cont
        ? [cont.first_name, cont.last_name].filter(Boolean).join(" ")
        : "";
      aoa.push([
        name,
        cont ? pickCampaignDialPhone(cont) ?? "" : "",
        retellOutcomeLabel(r.outcome),
        r.duration_seconds ?? "",
        formatDurationGreek(r.duration_seconds),
        r.called_at ?? "",
        r.transferred_to_politician ? "Ναι" : "Όχι",
        r.contact_id,
      ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "Κλήσεις");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const safeName = String((camp as { name?: string }).name ?? "campaign")
      .replace(/[^\wα-ωΑ-ΩάέήίόύώΆΈΉΊΌΎΏ\-]+/gi, "_")
      .slice(0, 40);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="kampania-${safeName}-calls.xlsx"`,
      },
    });
  } catch (e) {
    console.error("[api/campaigns/id/export GET]", e);
    return nextJsonError();
  }
}
