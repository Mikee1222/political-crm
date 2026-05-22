"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface ContactTab {
  id: string;
  name: string;
  contactId: string;
}

interface ContactTabsCtx {
  tabs: ContactTab[];
  activeTab: string | null;
  openTab: (contactId: string, name: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

const Ctx = createContext<ContactTabsCtx | null>(null);

export function ContactTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<ContactTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const openTab = useCallback((contactId: string, name: string) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.contactId === contactId);
      if (existing) {
        setActiveTab(existing.id);
        return prev;
      }
      if (prev.length >= 8) return prev;
      const id = `tab-${contactId}`;
      setActiveTab(id);
      return [...prev, { id, contactId, name: name.trim() || "Επαφή" }];
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTab === id) {
        setActiveTab(next[next.length - 1]?.id ?? null);
      }
      return next;
    });
  }, [activeTab]);

  return (
    <Ctx.Provider value={{ tabs, activeTab, openTab, closeTab, setActiveTab }}>
      {children}
    </Ctx.Provider>
  );
}

export function useContactTabs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useContactTabs outside provider");
  return ctx;
}
