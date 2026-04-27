import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPublicBaseUrl } from "@/lib/email";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contact_id: z.string().uuid(),
  option_id: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pollId } = await context.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const { contact_id, option_id } = parsed.data;
    const admin = createServiceClient();
    const { data: poll, error: pe } = await admin
      .from("polls")
      .select("id, options, status, ends_at")
      .eq("id", pollId)
      .maybeSingle();
    if (pe || !poll) {
      return NextResponse.json({ error: "Άκυρη δημοσκόπηση" }, { status: 404 });
    }
    if ((poll as { status: string }).status !== "active") {
      return NextResponse.json({ error: "Η δημοσκόπηση δεν είναι ενεργή" }, { status: 400 });
    }
    const end = (poll as { ends_at: string | null }).ends_at;
    if (end && new Date(end) < new Date()) {
      return NextResponse.json({ error: "Έληξε" }, { status: 400 });
    }
    const opts = (poll as { options: unknown }).options as Array<{ id: string; text: string }>;
    if (!Array.isArray(opts) || !opts.some((o) => o.id === option_id)) {
      return NextResponse.json({ error: "Άκυρη επιλογή" }, { status: 400 });
    }
    const { data: c } = await admin.from("contacts").select("id").eq("id", contact_id).maybeSingle();
    if (!c) {
      return NextResponse.json({ error: "Άκυρη επαφή" }, { status: 400 });
    }
    const { error: insErr } = await admin.from("poll_responses").insert({
      poll_id: pollId,
      contact_id,
      option_id,
    } as never);
    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "Έχετε ήδη απαντήσει" }, { status: 409 });
      }
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, thankYouUrl: `${getPublicBaseUrl()}/poll/${pollId}?contact=${contact_id}&voted=1` });
  } catch (e) {
    console.error("[public/polls vote]", e);
    return nextJsonError();
  }
}
