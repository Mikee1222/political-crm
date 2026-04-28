"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";
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
  /** True while /api/profile is in flight (after session is known for CRM). */
  loading: boolean;
  /** False until first Supabase getUser() completes for CRM routes (initial session check). */
  sessionResolved: boolean;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<Ctx | null>(null);

function isPortalPath(path: string) {
  return path === "/portal" || path.startsWith("/portal/");
}

function isCrmAppPath(path: string) {
  return path !== "/login" && !isPortalPath(path);
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionResolved, setSessionResolved] = useState(() => !isCrmAppPath(pathname));
  const crmSessionReadyRef = useRef(false);

  const loadProfile = useCallback(async () => {
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

  const refresh = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  useLayoutEffect(() => {
    if (pathname === "/login") {
      crmSessionReadyRef.current = false;
      setSessionResolved(true);
      setProfile(null);
      setLoading(false);
      return;
    }
    if (isPortalPath(pathname)) {
      setSessionResolved(true);
      setLoading(false);
      return;
    }
    if (!isCrmAppPath(pathname)) {
      return;
    }

    if (crmSessionReadyRef.current) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setSessionResolved(false);
      const supabase = createClient();
      const {
        data: { user },
        error: sessionErr,
      } = await supabase.auth.getUser();
      if (cancelled) {
        return;
      }
      if (sessionErr && isInvalidRefreshTokenError(sessionErr)) {
        try {
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
        crmSessionReadyRef.current = false;
        setSessionResolved(true);
        setProfile(null);
        setLoading(false);
        window.location.assign("/login");
        return;
      }
      crmSessionReadyRef.current = true;
      setSessionResolved(true);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      await loadProfile();
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, loadProfile]);

  return (
    <ProfileContext.Provider value={{ profile, loading, sessionResolved, refresh }}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const c = useContext(ProfileContext);
  if (!c) {
    throw new Error("useProfile outside ProfileProvider");
  }
  return c;
}
