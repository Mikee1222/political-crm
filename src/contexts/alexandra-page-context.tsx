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

export function AlexandraPageProvider({ children }: { children: ReactNode }) {
  const [contact, setContact] = useState<AlexandraPageContactContext | null>(null);
  const setContactPage = useCallback((v: AlexandraPageContactContext | null) => {
    setContact(v);
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
