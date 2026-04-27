import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const raw = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (raw.length < 2) {
      return NextResponse.json({
        contacts: [],
        requests: [],
        tasks: [],
        campaigns: [],
      });
    }
    const q = raw.replace(/[%_]/g, " ").trim() || raw;
    const p = `%${q}%`;

    const [cRes, rRes, tRes, caRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, phone2, landline, municipality, email, contact_code")
        .or(
          `first_name.ilike.${p},last_name.ilike.${p},phone.ilike.${p},phone2.ilike.${p},email.ilike.${p},contact_code.ilike.${p},municipality.ilike.${p}`,
        )
        .limit(5),
      supabase
        .from("requests")
        .select("id, request_code, title, status, description")
        .or(`title.ilike.${p},request_code.ilike.${p},description.ilike.${p}`)
        .limit(3),
      supabase
        .from("tasks")
        .select("id, title, due_date, completed, description")
        .or(`title.ilike.${p},description.ilike.${p}`)
        .limit(3),
      supabase
        .from("campaigns")
        .select("id, name, status, description")
        .or(`name.ilike.${p},description.ilike.${p}`)
        .limit(3),
    ]);

    if (cRes.error) {
      return NextResponse.json({ error: cRes.error.message }, { status: 400 });
    }

    return NextResponse.json({
      contacts: cRes.data ?? [],
      requests: rRes.error ? [] : rRes.data ?? [],
      tasks: tRes.error ? [] : tRes.data ?? [],
      campaigns: caRes.error ? [] : caRes.data ?? [],
    });
  } catch (e) {
    console.error(e);
    return nextJsonError();
  }
}
