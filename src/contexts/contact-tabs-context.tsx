"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type CrmTabEntity = "contact" | "request";

export interface ContactTab {
  id: string;
  name: string;
  /** @deprecated Prefer entityId — kept for existing contact callers. */
  contactId: string;
  entityType: CrmTabEntity;
  entityId: string;
}

interface ContactTabsCtx {
  tabs: ContactTab[];
  activeTab: string | null;
  openTab: (contactId: string, name: string) => void;
  openRequestTab: (requestId: string, name: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

const Ctx = createContext<ContactTabsCtx | null>(null);

const MAX_TABS = 8;

export function ContactTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<ContactTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const openEntityTab = useCallback((entityType: CrmTabEntity, entityId: string, name: string) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.entityType === entityType && t.entityId === entityId);
      if (existing) {
        setActiveTab(existing.id);
        return prev;
      }
      if (prev.length >= MAX_TABS) return prev;
      const id = `tab-${entityType}-${entityId}`;
      setActiveTab(id);
      return [
        ...prev,
        {
          id,
          contactId: entityType === "contact" ? entityId : "",
          entityType,
          entityId,
          name: name.trim() || (entityType === "request" ? "Αίτημα" : "Επαφή"),
        },
      ];
    });
  }, []);

  const openTab = useCallback(
    (contactId: string, name: string) => {
      openEntityTab("contact", contactId, name);
    },
    [openEntityTab],
  );

  const openRequestTab = useCallback(
    (requestId: string, name: string) => {
      openEntityTab("request", requestId, name);
    },
    [openEntityTab],
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (activeTab === id) {
          setActiveTab(next[next.length - 1]?.id ?? null);
        }
        return next;
      });
    },
    [activeTab],
  );

  return (
    <Ctx.Provider value={{ tabs, activeTab, openTab, openRequestTab, closeTab, setActiveTab }}>
      {children}
    </Ctx.Provider>
  );
}

export function useContactTabs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useContactTabs outside provider");
  return ctx;
}
