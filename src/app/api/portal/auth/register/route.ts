import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public self-registration disabled — portal accounts are created by CRM admins only. */
export async function POST() {
  return NextResponse.json(
    { error: "Η εγγραφή δεν είναι διαθέσιμη. Επικοινωνήστε με το γραφείο." },
    { status: 403 },
  );
}
