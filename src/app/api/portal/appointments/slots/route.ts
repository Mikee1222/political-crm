import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlotsForDate } from "@/lib/appointment-slots";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") ?? "";
    const r = await getAvailableSlotsForDate(date);
    if (!r.ok) {
      if (r.code === "bad_date") {
        return NextResponse.json({ error: "Άκυρη ημερομηνία" }, { status: 400 });
      }
      return NextResponse.json({ error: "Μη διαθέσιμο ημερολόγιο γραφείου", slots: [] }, { status: 503 });
    }
    return NextResponse.json({ slots: r.slots });
  } catch (e) {
    console.error("[portal/appointments/slots]", e);
    return nextJsonError();
  }
}
