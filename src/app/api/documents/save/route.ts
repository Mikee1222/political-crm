import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
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
