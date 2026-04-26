import { NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";

function normalizeGreek(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function GET() {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
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
    const namesSet = new Set(names.map((n) => normalizeGreek(n)));

    const celebratingByName = (contacts ?? []).filter((c) => {
      const firstName = normalizeGreek(c.first_name ?? "");
      const nickname = normalizeGreek(c.nickname ?? "");
      return namesSet.has(firstName) || (nickname && namesSet.has(nickname));
    });

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
