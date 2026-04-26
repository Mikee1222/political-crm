import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

export type UserProfile = {
  id: string;
  full_name: string | null;
  role: Role;
  created_at?: string;
};

export async function getSessionWithProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, profile: null, supabase };
  }
  const { data: row } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const role = (row?.role as Role) || "caller";
  const profile: UserProfile = row
    ? { id: row.id, full_name: row.full_name, role, created_at: row.created_at as string }
    : { id: user.id, full_name: null, role: "caller" };
  return { user, profile, supabase };
}

export async function requireProfile() {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 }),
    };
  }
  return { user, profile, supabase };
}

export function forbidden() {
  return NextResponse.json({ error: "Δεν επιτρέπεται" }, { status: 403 });
}

export function requireAnyRole(profile: UserProfile, roles: Role[]) {
  return roles.includes(profile.role);
}
