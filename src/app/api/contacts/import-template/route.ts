import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { checkCRMAccess } from "@/lib/crm-api-access";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

function escapeCsvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    if (!hasMinRole(crm.profile?.role, "caller")) {
      return forbidden();
    }

    const headers = [
      "Κωδικός επαφής",
      "Όνομα",
      "Επίθετο",
      "Όνομα πατέρα",
      "Όνομα μητέρας",
      "Τηλέφωνο 1",
      "Τηλέφωνο 2",
      "Σταθερό",
      "Email",
      "Δήμος",
      "Περιοχή",
      "Τοπωνύμιο",
      "Εκλ. διαμέρισμα",
      "Πολιτική στάση",
      "Κατάσταση κλήσης",
      "Προτεραιότητα",
      "Ομάδα",
      "Ετικέτες",
      "Σημειώσεις",
    ];

    const row1 = [
      "",
      "Γιάννης",
      "Παπαδόπουλος",
      "Δημήτριος",
      "Ελένη",
      "6912345678",
      "",
      "2641023456",
      "g.pap@example.com",
      "Αγρίνιο",
      "Κέντρο",
      "",
      "",
      "ΝΔ",
      "Pending",
      "Medium",
      "Βάση ψηφοφόρων",
      "εθελοντής; τοπικός",
      "Συνάντηση στο σούπερ μάρκετ.",
    ];

    const row2 = [
      "",
      "Μαρία",
      "Γεωργίου",
      "",
      "",
      "6970090090",
      "6980011122",
      "",
      "",
      "Μεσολόγγι",
      "Λιμάνι",
      "",
      "",
      "ΠΑΣΟΚ",
      "Positive",
      "High",
      "",
      "VIP",
      "",
    ];

    const lines = [
      headers.map(escapeCsvCell).join(","),
      row1.map(escapeCsvCell).join(","),
      row2.map(escapeCsvCell).join(","),
    ];
    const csv = "\uFEFF" + lines.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="epafes-template.csv"',
      },
    });
  } catch (e) {
    console.error("[api/contacts/import-template]", e);
    return nextJsonError();
  }
}
