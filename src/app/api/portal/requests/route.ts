import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, createPortalRequest } from "@/lib/portal";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const portal = await getPortalUser(supabase, user.id);
    if (!portal || !portal.contact_id) {
      return NextResponse.json({ error: "Μη πολίτης" }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("requests")
      .select("id, request_code, title, category, status, created_at, description, portal_message")
      .eq("contact_id", portal.contact_id)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ requests: data ?? [] });
  } catch (e) {
    console.error("[api/portal/requests GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const portal = await getPortalUser(supabase, user.id);
    if (!portal) {
      return NextResponse.json({ error: "Μη πολίτης" }, { status: 403 });
    }
    const body = (await request.json()) as { title?: string; description?: string; category?: string };
    const { data, error } = await createPortalRequest(supabase, portal, body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/portal/requests POST]", e);
    return nextJsonError();
  }
}
