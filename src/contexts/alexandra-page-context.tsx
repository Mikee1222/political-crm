"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type AlexandraPageContactContext = {
  contactId: string;
  contactName: string;
};

export type AlexandraPageContext =
  | { type: "contact"; contactId: string; contactName: string }
  | { type: "request"; requestId: string; requestTitle: string; requestStatus: string }
  | { type: "contacts_list"; filters?: Record<string, unknown>; totalCount?: number }
  | { type: "requests_list"; filters?: Record<string, unknown>; totalCount?: number }
  | { type: "campaign"; campaignId: string; campaignName: string; status: string }
  | { type: "dashboard" }
  | { type: "analytics" }
  | { type: "tasks" }
  | { type: "events" }
  | { type: "volunteers" }
  | { type: "settings" }
  | { type: "namedays" };

type Ctx = {
  pageContext: AlexandraPageContext | null;
  setPageContext: (v: AlexandraPageContext | null) => void;
  /** Contact slice when pageContext.type === "contact" */
  contact: AlexandraPageContactContext | null;
  /** Sets contact page context (e.g. swipe-to-Alexandra on contacts list) */
  setContactPage: (v: AlexandraPageContactContext | null) => void;
};

const AlexandraPageContext = createContext<Ctx | null>(null);

function samePageContext(a: AlexandraPageContext | null, b: AlexandraPageContext | null) {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "contact":
      return (
        b.type === "contact" &&
        a.contactId === b.contactId &&
        a.contactName === b.contactName
      );
    case "request":
      return (
        b.type === "request" &&
        a.requestId === b.requestId &&
        a.requestTitle === b.requestTitle &&
        a.requestStatus === b.requestStatus
      );
    case "campaign":
      return (
        b.type === "campaign" &&
        a.campaignId === b.campaignId &&
        a.campaignName === b.campaignName &&
        a.status === b.status
      );
    case "contacts_list":
      return (
        b.type === "contacts_list" &&
        a.totalCount === b.totalCount &&
        JSON.stringify(a.filters ?? null) === JSON.stringify(b.filters ?? null)
      );
    case "requests_list":
      return (
        b.type === "requests_list" &&
        a.totalCount === b.totalCount &&
        JSON.stringify(a.filters ?? null) === JSON.stringify(b.filters ?? null)
      );
    default:
      return true;
  }
}

function contactFromPageContext(ctx: AlexandraPageContext | null): AlexandraPageContactContext | null {
  if (ctx?.type === "contact") {
    return { contactId: ctx.contactId, contactName: ctx.contactName };
  }
  return null;
}

export function AlexandraPageProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<AlexandraPageContext | null>(null);
  const setPageContext = useCallback((v: AlexandraPageContext | null) => {
    setPageContextState((prev) => (samePageContext(prev, v) ? prev : v));
  }, []);
  const setContactPage = useCallback((v: AlexandraPageContactContext | null) => {
    setPageContext(v ? { type: "contact", contactId: v.contactId, contactName: v.contactName } : null);
  }, [setPageContext]);
  const contact = useMemo(() => contactFromPageContext(pageContext), [pageContext]);
  const value = useMemo(
    () => ({ pageContext, setPageContext, contact, setContactPage }),
    [pageContext, setPageContext, contact, setContactPage],
  );
  return <AlexandraPageContext.Provider value={value}>{children}</AlexandraPageContext.Provider>;
}

export function useAlexandraPageContext() {
  const v = useContext(AlexandraPageContext);
  if (!v) {
    throw new Error("useAlexandraPageContext requires AlexandraPageProvider");
  }
  return v;
}

/** @deprecated Prefer useAlexandraPageContext */
export function useAlexandraPageContact() {
  return useAlexandraPageContext();
}

export function useOptionalAlexandraPageContext() {
  return useContext(AlexandraPageContext);
}

/** @deprecated Prefer useOptionalAlexandraPageContext */
export function useOptionalAlexandraPageContact() {
  return useContext(AlexandraPageContext);
}
