import type { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import type { CrmAccessResult } from "@/lib/crm-api-access";

export function requireManagerApi(crm: CrmAccessResult): NextResponse | null {
  if (!crm.allowed) return crm.response;
  if (!hasMinRole(crm.profile?.role, "manager")) return forbidden();
  return null;
}
