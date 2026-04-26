import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const body = (await request.json()) as {
      title?: string;
      content_summary?: string;
      key_points?: unknown;
      analysis?: unknown;
    };
    const { data, error } = await supabase
      .from("analyzed_documents")
      .insert({
        title: String(body.title ?? "Άνευ τίτλου"),
        content_summary: String(body.content_summary ?? ""),
        key_points: body.key_points ?? null,
        analysis: body.analysis ?? null,
        user_id: user.id,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e) {
    console.error("[api/documents/save]", e);
    return nextJsonError();
  }
}
