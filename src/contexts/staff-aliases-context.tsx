"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { resolveAuthorName, type StaffAlias } from "@/lib/staff-aliases";

type Ctx = {
  aliases: StaffAlias[];
  loading: boolean;
  refresh: () => Promise<void>;
  resolveName: (name: string | null | undefined) => string;
};

const StaffAliasesContext = createContext<Ctx | null>(null);

export function StaffAliasesProvider({ children }: { children: React.ReactNode }) {
  const [aliases, setAliases] = useState<StaffAlias[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/staff-aliases");
      if (!res.ok) {
        setAliases([]);
        return;
      }
      const j = (await res.json()) as { aliases?: StaffAlias[] };
      setAliases(j.aliases ?? []);
    } catch {
      setAliases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolveName = useCallback(
    (name: string | null | undefined) => resolveAuthorName(name ?? null, aliases),
    [aliases],
  );

  const value = useMemo(
    () => ({
      aliases,
      loading,
      refresh: load,
      resolveName,
    }),
    [aliases, loading, load, resolveName],
  );

  return <StaffAliasesContext.Provider value={value}>{children}</StaffAliasesContext.Provider>;
}

export function useStaffAliases() {
  const ctx = useContext(StaffAliasesContext);
  if (!ctx) {
    throw new Error("useStaffAliases must be used within StaffAliasesProvider");
  }
  return ctx;
}

export function useOptionalStaffAliases() {
  return useContext(StaffAliasesContext);
}

export function useResolveAuthorName() {
  const ctx = useOptionalStaffAliases();
  return useCallback(
    (name: string | null | undefined) => {
      if (!ctx) return name?.trim() || "Άγνωστος";
      return ctx.resolveName(name);
    },
    [ctx],
  );
}
