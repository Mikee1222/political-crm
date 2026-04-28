import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { mergePreferences, type UserPreferences } from "@/lib/user-preferences";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";

export type UserProfile = {
  id: string;
  full_name: string | null;
  role: Role;
  is_portal?: boolean;
  created_at?: string;
  email?: string | null;
  avatar_url?: string | null;
  preferences?: UserPreferences;
  /** CRM theme: dark | light */
  theme?: "dark" | "light" | string;
};

function profileFromRow(
  row: {
    id: string;
    full_name: string | null;
    role: string;
    is_portal?: boolean;
    created_at?: string;
    avatar_url?: string | null;
    preferences?: unknown;
    theme?: string | null;
  } | null,
  userId: string,
  role: Role,
  email: string | null | undefined,
): UserProfile {
  if (row) {
    const th = row.theme;
    return {
      id: row.id,
      full_name: row.full_name,
      role,
      is_portal: Boolean((row as { is_portal?: boolean }).is_portal),
      created_at: row.created_at as string | undefined,
      email: email ?? null,
      avatar_url: row.avatar_url ?? null,
      preferences: mergePreferences(
        (row.preferences as Record<string, unknown> | null) ?? undefined,
        undefined,
      ),
      theme: th === "light" || th === "dark" ? th : undefined,
    };
  }
  return {
    id: userId,
    full_name: null,
    role,
    is_portal: false,
    email: email ?? null,
    avatar_url: null,
    preferences: mergePreferences(null, null),
  };
}

export async function getSessionWithProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError && isInvalidRefreshTokenError(userError)) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    return { user: null, profile: null, supabase };
  }
  if (!user) {
    return { user: null, profile: null, supabase };
  }
  const { data: row } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const role = (row?.role as Role) || "caller";
  const profile: UserProfile = row
    ? profileFromRow(
        {
          id: row.id,
          full_name: row.full_name,
          role: String(row.role),
          is_portal: (row as { is_portal?: boolean }).is_portal,
          created_at: row.created_at as string,
          avatar_url: (row as { avatar_url?: string | null }).avatar_url,
          preferences: (row as { preferences?: unknown }).preferences,
          theme: (row as { theme?: string | null }).theme,
        },
        user.id,
        role,
        user.email,
      )
    : profileFromRow(null, user.id, role, user.email);
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

export function isCrmUser(profile: UserProfile | null | undefined): boolean {
  return !profile || profile.is_portal !== true;
}
