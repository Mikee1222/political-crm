"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import type { Role } from "@/lib/roles";
import type { UserPreferences } from "@/lib/user-preferences";

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  is_portal?: boolean;
  created_at?: string;
  email?: string | null;
  avatar_url?: string | null;
  theme?: "dark" | "light" | string;
  preferences?: UserPreferences;
};

type Ctx = {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<Ctx | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/profile", { timeoutMs: CLIENT_FETCH_TIMEOUT_MS, credentials: "same-origin" });
      if (!res.ok) {
        setProfile(null);
        return;
      }
      const data = (await res.json()) as { profile: Profile };
      setProfile(data.profile);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    if (path === "/login") {
      setLoading(false);
      return;
    }
    if (
      path === "/portal" ||
      path.startsWith("/portal/login") ||
      path.startsWith("/portal/register") ||
      path === "/portal/news" ||
      path.startsWith("/portal/news/")
    ) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh]);

  return <ProfileContext.Provider value={{ profile, loading, refresh }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const c = useContext(ProfileContext);
  if (!c) {
    throw new Error("useProfile outside ProfileProvider");
  }
  return c;
}
