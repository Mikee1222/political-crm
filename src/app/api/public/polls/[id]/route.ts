import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const admin = createServiceClient();
    const { data: poll, error } = await admin
      .from("polls")
      .select("id, title, question, options, status, ends_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !poll) {
      return NextResponse.json({ error: "Άκυρη δημοσκόπηση" }, { status: 404 });
    }
    if ((poll as { status: string }).status !== "active") {
      return NextResponse.json({ error: "Η δημοσκόπηση δεν είναι ενεργή" }, { status: 400 });
    }
    const end = (poll as { ends_at: string | null }).ends_at;
    if (end && new Date(end) < new Date()) {
      return NextResponse.json({ error: "Έληξε" }, { status: 400 });
    }
    return NextResponse.json({ poll });
  } catch (e) {
    console.error("[public/polls GET]", e);
    return nextJsonError();
  }
}
