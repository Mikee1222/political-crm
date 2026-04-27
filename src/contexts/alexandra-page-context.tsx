"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type AlexandraPageContactContext = {
  contactId: string;
  contactName: string;
};

type Ctx = {
  contact: AlexandraPageContactContext | null;
  setContactPage: (v: AlexandraPageContactContext | null) => void;
};

const AlexandraPageContext = createContext<Ctx | null>(null);

function samePageContact(
  a: AlexandraPageContactContext | null,
  b: AlexandraPageContactContext | null,
) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return a === b;
  }
  return a.contactId === b.contactId && a.contactName === b.contactName;
}

export function AlexandraPageProvider({ children }: { children: ReactNode }) {
  const [contact, setContact] = useState<AlexandraPageContactContext | null>(null);
  const setContactPage = useCallback((v: AlexandraPageContactContext | null) => {
    setContact((prev) => (samePageContact(prev, v) ? prev : v));
  }, []);
  const value = useMemo(() => ({ contact, setContactPage }), [contact, setContactPage]);
  return <AlexandraPageContext.Provider value={value}>{children}</AlexandraPageContext.Provider>;
}

export function useAlexandraPageContact() {
  const v = useContext(AlexandraPageContext);
  if (!v) {
    throw new Error("useAlexandraPageContact requires AlexandraPageProvider");
  }
  return v;
}

export function useOptionalAlexandraPageContact() {
  return useContext(AlexandraPageContext);
}
