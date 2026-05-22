import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { contactCelebratesNameday } from "@/lib/namedays";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const [{ data: namedays }, { data: contacts }, { data: birthdays }] = await Promise.all([
      supabase.from("name_days").select("names").eq("month", month).eq("day", day),
      supabase.from("contacts").select("id, first_name, last_name, nickname, phone, birthday"),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, nickname, phone, birthday")
        .like("birthday", `%-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`),
    ]);

    const names = (namedays ?? []).flatMap((x) => x.names ?? []);

    const celebratingByName = (contacts ?? []).filter((c) =>
      contactCelebratesNameday(c.first_name, c.nickname, names),
    );

    return NextResponse.json({
      names,
      celebratingByName,
      birthdays: birthdays ?? [],
    });
  } catch (e) {
    console.error("[api/contacts/celebrating-today]", e);
    return nextJsonError();
  }
}
