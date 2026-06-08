"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type TourId = "welcome" | "contacts_tour" | "requests_tour";

export const CRM_TOUR_COMPLETED_KEY = "crm-tour-completed";

type TourContextValue = {
  activeTour: TourId | null;
  setActiveTour: (id: TourId | null) => void;
  completeTour: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [activeTour, setActiveTourState] = useState<TourId | null>(null);

  const setActiveTour = useCallback((id: TourId | null) => {
    setActiveTourState(id);
  }, []);

  const completeTour = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CRM_TOUR_COMPLETED_KEY, "true");
      } catch {
        // ignore
      }
    }
    setActiveTourState(null);
  }, []);

  return (
    <TourContext.Provider value={{ activeTour, setActiveTour, completeTour }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour requires TourProvider");
  return ctx;
}

export function useOptionalTour() {
  return useContext(TourContext);
}
