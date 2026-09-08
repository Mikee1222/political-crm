"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import type { RequestCategoryRow } from "@/lib/request-categories";
import { ROLE_BADGE, type Role } from "@/lib/roles";
import type { UnlinkedLegacyName } from "@/lib/staff-aliases";

export type RequestFilterAssignee = {
  id: string;
  full_name: string | null;
  role: string;
};

type Cache = {
  categories: RequestCategoryRow[];
  assignees: RequestFilterAssignee[];
  unlinkedHandlers: UnlinkedLegacyName[];
};

let cached: Cache | null = null;
let inflight: Promise<Cache> | null = null;

function roleLabel(role: string): string {
  if (role in ROLE_BADGE) return ROLE_BADGE[role as Role];
  return role;
}

export function formatAssigneeOptionLabel(a: {
  full_name: string | null;
  role?: string;
  id: string;
}): string {
  const name = a.full_name?.trim() || a.id;
  const role = a.role?.trim();
  return role ? `${name} (${roleLabel(role)})` : name;
}

async function loadRequestFilterOptions(): Promise<Cache> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const empty: Cache = { categories: [], assignees: [], unlinkedHandlers: [] };
    try {
      const [catRes, teamRes, unlinkedRes] = await Promise.all([
        fetchWithTimeout("/api/request-categories").catch(() => null),
        fetchWithTimeout("/api/team/assignees").catch(() => null),
        fetchWithTimeout("/api/staff-aliases/unlinked").catch(() => null),
      ]);

      let categories: RequestCategoryRow[] = [];
      if (catRes?.ok) {
        const d = (await catRes.json()) as {
          items?: RequestCategoryRow[];
          categories?: string[];
        };
        if (d.items?.length) {
          categories = d.items;
        } else if (d.categories?.length) {
          categories = d.categories.map((name) => ({
            id: name,
            name,
            color: "#6B7280",
            sort_order: 0,
            created_at: "",
          }));
        }
      }

      let assignees: RequestFilterAssignee[] = [];
      if (teamRes?.ok) {
        const d = (await teamRes.json()) as { assignees?: RequestFilterAssignee[] };
        assignees = (d.assignees ?? []).filter((a) => a.full_name?.trim() || a.id);
      }

      let unlinkedHandlers: UnlinkedLegacyName[] = [];
      if (unlinkedRes?.ok) {
        const d = (await unlinkedRes.json()) as { unlinked?: UnlinkedLegacyName[] };
        unlinkedHandlers = d.unlinked ?? [];
      }

      cached = { categories, assignees, unlinkedHandlers };
      return cached;
    } catch {
      return empty;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function invalidateRequestFilterOptionsCache() {
  cached = null;
  inflight = null;
}

/** Shared categories + CRM assignees for request list / advanced search filters. */
export function useRequestFilterOptions() {
  const [categories, setCategories] = useState<RequestCategoryRow[]>(
    () => cached?.categories ?? [],
  );
  const [assignees, setAssignees] = useState<RequestFilterAssignee[]>(
    () => cached?.assignees ?? [],
  );
  const [unlinkedHandlers, setUnlinkedHandlers] = useState<UnlinkedLegacyName[]>(
    () => cached?.unlinkedHandlers ?? [],
  );
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    setLoading(!cached);
    void loadRequestFilterOptions().then((next) => {
      if (cancelled) return;
      setCategories(next.categories);
      setAssignees(next.assignees);
      setUnlinkedHandlers(next.unlinkedHandlers);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.name, label: c.name })),
    [categories],
  );

  const assigneeOptions = useMemo(() => {
    const options = assignees.map((a) => ({
      value: a.id,
      label: formatAssigneeOptionLabel(a),
    }));
    for (const row of unlinkedHandlers) {
      const name = row.name.trim();
      if (!name) continue;
      options.push({ value: name, label: name });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, "el"));
  }, [assignees, unlinkedHandlers]);

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.name, c.name])),
    [categories],
  );

  const handlerNames = useMemo(() => {
    const map = new Map(
      assignees.map((a) => [a.id, a.full_name?.trim() || a.id]),
    );
    for (const row of unlinkedHandlers) {
      const name = row.name.trim();
      if (name) map.set(name, name);
    }
    return map;
  }, [assignees, unlinkedHandlers]);

  return {
    loading,
    categories,
    assignees,
    unlinkedHandlers,
    categoryOptions,
    assigneeOptions,
    categoryNames,
    handlerNames,
  };
}
