import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { countContactsMatching, type ContactFilter } from "@/lib/contacts-filter-query";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { profile, supabase } = crm;
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const f: ContactFilter = {
    call_status: request.nextUrl.searchParams.get("call_status") ?? undefined,
    area: request.nextUrl.searchParams.get("area") ?? undefined,
    municipality: request.nextUrl.searchParams.get("municipality") ?? undefined,
    priority: request.nextUrl.searchParams.get("priority") ?? undefined,
    tag: request.nextUrl.searchParams.get("tag") ?? undefined,
  };

  const { count, error } = await countContactsMatching(supabase, f);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ count });
  } catch (e) {
    console.error("[api/campaigns/preview]", e);
    return nextJsonError();
  }
}
