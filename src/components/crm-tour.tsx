"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react";
import type { TourId } from "@/contexts/tour-context";

export interface TourStep {
  title: string;
  description: string;
  target?: string;
  position: "top" | "bottom" | "left" | "right" | "center";
  url?: string;
  action?: string;
}

export const TOURS: Record<TourId, { name: string; steps: TourStep[] }> = {
  welcome: {
    name: "Καλωσόρισμα στο CRM",
    steps: [
      {
        title: "Καλώς ήρθες στο CRM Καραγκούνης!",
        description:
          'Σε λίγα βήματα θα μάθεις πώς να χρησιμοποιείς το σύστημα. Πάτα "Επόμενο" για να ξεκινήσουμε.',
        position: "center",
      },
      {
        title: "Πλοήγηση",
        description:
          "Αριστερά βρίσκεται το κύριο μενού. Από εδώ μπορείς να πας σε Επαφές, Αιτήματα, Καμπάνιες και όλες τις άλλες λειτουργίες.",
        target: '[data-tour="sidebar"]',
        position: "right",
      },
      {
        title: "Επαφές",
        description:
          "Εδώ βρίσκεται η βάση δεδομένων με όλες τις επαφές. Μπορείς να ψάχνεις, να φιλτράρεις και να διαχειρίζεσαι επαφές.",
        target: '[data-tour="nav-contacts"]',
        position: "right",
        url: "/contacts",
      },
      {
        title: "Αναζήτηση",
        description: "Για γρήγορη αναζήτηση πάτα ⌘K. Μπορείς να ψάξεις με όνομα, τηλέφωνο ή οτιδήποτε άλλο.",
        target: '[data-tour="search-button"]',
        position: "bottom",
      },
      {
        title: "Αιτήματα",
        description:
          "Εδώ καταγράφεις τα αιτήματα πολιτών. Κάθε αίτημα έχει κατηγορία, κατάσταση και χειριστή.",
        target: '[data-tour="nav-requests"]',
        position: "right",
        url: "/requests",
      },
      {
        title: "Η Αλεξάνδρα — ο AI βοηθός σου",
        description:
          "Η Αλεξάνδρα είναι η AI γραμματέας σου. Μπορείς να της πεις τι θέλεις με απλά ελληνικά και θα το κάνει για σένα!",
        target: '[data-tour="alexandra-button"]',
        position: "top",
        url: "/alexandra",
      },
      {
        title: "Έτοιμος!",
        description:
          'Τώρα ξέρεις τα βασικά! Αν χρειαστείς βοήθεια, ρώτα πάντα την Αλεξάνδρα. Πες της "βοήθεια" ή "πώς να κάνω X".',
        position: "center",
      },
    ],
  },
  contacts_tour: {
    name: "Επαφές — Ολοκληρωμένος Οδηγός",
    steps: [
      {
        title: "Σελίδα Επαφών",
        description: "Εδώ βλέπεις όλες τις επαφές. Χρησιμοποίησε φίλτρα και αναζήτηση για να βρεις γρήγορα ό,τι χρειάζεσαι.",
        position: "center",
        url: "/contacts",
      },
      {
        title: "Φίλτρα",
        description:
          "Χρησιμοποίησε τα φίλτρα για να βρεις επαφές. Μπορείς να φιλτράρεις με Δήμο, Ομάδα, Φύλο και Ηλικία.",
        target: '[data-tour="contacts-filters"]',
        position: "bottom",
      },
      {
        title: "Προχωρημένη Αναζήτηση",
        description:
          'Για πιο σύνθετες αναζητήσεις πάτα "Προχωρημένη αναζήτηση". Εκεί μπορείς να συνδυάσεις πολλά κριτήρια.',
        target: '[data-tour="advanced-search-link"]',
        position: "bottom",
      },
      {
        title: "Κάρτα Επαφής",
        description:
          "Κάθε επαφή εμφανίζεται σε κάρτα με όνομα, τηλέφωνο και ομάδες. Κάνε κλικ για να ανοίξεις την καρτέλα.",
        target: '[data-tour="contact-card"]',
        position: "right",
      },
      {
        title: "Νέα Επαφή",
        description: 'Για να προσθέσεις νέα επαφή πάτα το κουμπί "+ Νέα Επαφή".',
        target: '[data-tour="new-contact-button"]',
        position: "left",
      },
    ],
  },
  requests_tour: {
    name: "Αιτήματα — Ολοκληρωμένος Οδηγός",
    steps: [
      {
        title: "Σελίδα Αιτημάτων",
        description:
          "Εδώ διαχειρίζεσαι τα αιτήματα πολιτών. Κάθε αίτημα έχει κατάσταση, κατηγορία και χειριστή.",
        position: "center",
        url: "/requests",
      },
      {
        title: "Καταστάσεις Αιτημάτων",
        description:
          "Κάθε αίτημα μπορεί να είναι: Ανοικτό, Κλειστό με επιτυχία, Κλειστό χωρίς επιτυχία, ή Δεν είναι δυνατή η πραγματοποίησή του.",
        position: "center",
      },
      {
        title: "Φίλτρα Αιτημάτων",
        description:
          "Φιλτράρισε με Κατάσταση και Κατηγορία. Για περισσότερα φίλτρα χρησιμοποίησε την Προχωρημένη Αναζήτηση.",
        target: '[data-tour="requests-filters"]',
        position: "bottom",
      },
      {
        title: "Νέο Αίτημα",
        description: 'Πάτα "+ Νέο Αίτημα" για να καταγράψεις ένα νέο αίτημα πολίτη.',
        target: '[data-tour="new-request-button"]',
        position: "left",
      },
    ],
  },
};

const POPUP_W = 320;
const POPUP_EST_H = 280;
const PAD = 16;

function pathMatches(url: string | undefined, pathname: string): boolean {
  if (!url) return true;
  return pathname === url || pathname.startsWith(`${url}/`);
}

function resolveTarget(selector: string | undefined): Element | null {
  if (!selector) return null;
  if (selector.includes(":first-child")) {
    const base = selector.replace(/:first-child$/, "");
    const parent = document.querySelector(base);
    return parent?.firstElementChild ?? parent;
  }
  const matches = document.querySelectorAll(selector);
  for (const el of matches) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return matches[0] ?? null;
}

function computePopupStyle(targetRect: DOMRect | null, position: TourStep["position"]): CSSProperties {
  if (!targetRect || position === "center") {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: POPUP_W,
    };
  }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  const clampLeft = (left: number) => Math.max(PAD, Math.min(left, vw - POPUP_W - PAD));
  const clampTop = (top: number) => Math.max(PAD, Math.min(top, vh - POPUP_EST_H - PAD));

  if (position === "bottom") {
    let top = targetRect.bottom + PAD;
    const left = clampLeft(targetRect.left + targetRect.width / 2 - POPUP_W / 2);
    if (top + POPUP_EST_H > vh - PAD) {
      top = clampTop(targetRect.top - POPUP_EST_H - PAD);
    }
    return { top, left, width: POPUP_W };
  }

  if (position === "top") {
    const top = clampTop(targetRect.top - POPUP_EST_H - PAD);
    const left = clampLeft(targetRect.left + targetRect.width / 2 - POPUP_W / 2);
    if (top <= PAD) {
      return { top: targetRect.bottom + PAD, left, width: POPUP_W };
    }
    return { top, left, width: POPUP_W };
  }

  if (position === "right") {
    let left = targetRect.right + PAD;
    const top = clampTop(targetRect.top + targetRect.height / 2 - POPUP_EST_H / 2);
    if (left + POPUP_W > vw - PAD) {
      left = clampLeft(targetRect.left - POPUP_W - PAD);
    }
    return { top, left, width: POPUP_W };
  }

  if (position === "left") {
    let left = clampLeft(targetRect.left - POPUP_W - PAD);
    const top = clampTop(targetRect.top + targetRect.height / 2 - POPUP_EST_H / 2);
    if (left <= PAD) {
      left = targetRect.right + PAD;
    }
    return { top, left, width: POPUP_W };
  }

  return {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: POPUP_W,
  };
}

export function CRMTour({ tourId, onComplete }: { tourId: TourId | null; onComplete: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const tour = tourId ? TOURS[tourId] : undefined;
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({ width: POPUP_W });

  const step = tour?.steps[currentStep];
  const isLast = tour ? currentStep === tour.steps.length - 1 : true;
  const isFirst = currentStep === 0;

  const refreshTarget = useCallback(() => {
    if (!step) return;
    if (!step.target) {
      setTargetRect(null);
      setPopupStyle(computePopupStyle(null, step.position));
      return;
    }
    const el = resolveTarget(step.target);
    if (!el) {
      setTargetRect(null);
      setPopupStyle(computePopupStyle(null, step.position));
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setTargetRect(null);
      setPopupStyle(computePopupStyle(null, step.position));
      return;
    }
    setTargetRect(rect);
    setPopupStyle(computePopupStyle(rect, step.position));
  }, [step]);

  useLayoutEffect(() => {
    if (!tour) return;
    setCurrentStep(0);
  }, [tourId, tour]);

  useEffect(() => {
    if (!step) return;
    if (step.url && !pathMatches(step.url, pathname)) {
      router.push(step.url);
      return;
    }
    const t = window.setTimeout(refreshTarget, step.url ? 350 : 50);
    return () => window.clearTimeout(t);
  }, [currentStep, step, pathname, router, refreshTarget]);

  useEffect(() => {
    if (!step?.target) return;
    const onLayout = () => refreshTarget();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [step?.target, refreshTarget]);

  const handleNext = useCallback(async () => {
    if (!tour || isLast) return;
    const nextIndex = currentStep + 1;
    const nextStep = tour.steps[nextIndex];
    if (nextStep.url && !pathMatches(nextStep.url, window.location.pathname)) {
      router.push(nextStep.url);
      await new Promise((r) => setTimeout(r, 500));
    }
    setCurrentStep(nextIndex);
  }, [tour, isLast, currentStep, router]);

  const handleBack = useCallback(async () => {
    if (!tour || isFirst) return;
    const prevIndex = currentStep - 1;
    const prevStep = tour.steps[prevIndex];
    if (prevStep.url && !pathMatches(prevStep.url, window.location.pathname)) {
      router.push(prevStep.url);
      await new Promise((r) => setTimeout(r, 500));
    }
    setCurrentStep(prevIndex);
  }, [tour, isFirst, currentStep, router]);

  if (!tourId || !tour || !step) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[140] bg-black/50" aria-hidden />

      {targetRect ? (
        <div
          className="pointer-events-none fixed z-[141] rounded-lg ring-4 ring-[var(--accent-gold)] ring-offset-2 ring-offset-[var(--bg-primary)]"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-modal
        aria-labelledby="crm-tour-title"
        className="pointer-events-auto fixed z-[142] rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-2xl"
        style={popupStyle}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-gold)]">
              <Lightbulb className="h-4 w-4 text-[var(--text-badge-on-gold)]" aria-hidden />
            </div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Βήμα {currentStep + 1} από {tour.steps.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onComplete}
            className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            aria-label="Κλείσιμο ξεναγίας"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 h-1 w-full rounded-full bg-[var(--border)]">
          <div
            className="h-1 rounded-full bg-[var(--accent-gold)] transition-all"
            style={{ width: `${((currentStep + 1) / tour.steps.length) * 100}%` }}
          />
        </div>

        <h3 id="crm-tour-title" className="mb-2 font-bold text-[var(--text-primary)]">
          {step.title}
        </h3>
        <p className="mb-4 text-sm leading-relaxed text-[var(--text-secondary)]">{step.description}</p>

        <div className="relative z-[143] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleBack()}
            disabled={isFirst}
            className="pointer-events-auto flex items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Πίσω
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onComplete}
              className="pointer-events-auto rounded-lg bg-[var(--accent-gold)] px-4 py-2 text-sm font-medium text-[var(--text-badge-on-gold)] hover:opacity-90"
            >
              Τέλος!
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleNext()}
              className="pointer-events-auto flex items-center gap-1 rounded-lg bg-[var(--accent-gold)] px-4 py-2 text-sm font-medium text-[var(--text-badge-on-gold)] hover:opacity-90"
            >
              Επόμενο
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
