"use client";

import { useState } from "react";
import { Landmark, Megaphone, Scale, Users, type LucideIcon } from "lucide-react";

type CareerStatus = "active" | "completed";

type CareerItem = {
  id: number;
  title: string;
  date: string;
  content: string;
  icon: LucideIcon;
  relatedIds: number[];
  status: CareerStatus;
};

const CAREER_TIMELINE: CareerItem[] = [
  {
    id: 0,
    title: "Υφυπουργός Εργασίας & Κοινωνικής Ασφάλισης",
    date: "2023 – σήμερα",
    content:
      "Υφυπουργός Εργασίας και Κοινωνικής Ασφάλισης στην κυβέρνηση Μητσοτάκη.",
    icon: Landmark,
    relatedIds: [1, 2],
    status: "active",
  },
  {
    id: 1,
    title: "Βουλευτής",
    date: "2009",
    content: "Βουλευτής Νέας Δημοκρατίας, Αιτωλοακαρνανία.",
    icon: Landmark,
    relatedIds: [2, 3],
    status: "completed",
  },
  {
    id: 2,
    title: "Υπ. Δικαιοσύνης",
    date: "2012",
    content: "Αναπληρωτής Υπουργός Δικαιοσύνης στην κυβέρνηση Σαμαρά.",
    icon: Scale,
    relatedIds: [1, 4],
    status: "completed",
  },
  {
    id: 3,
    title: "Εκπρόσωπος Τύπου",
    date: "2015",
    content: "Εκπρόσωπος Τύπου της Νέας Δημοκρατίας.",
    icon: Megaphone,
    relatedIds: [1, 4],
    status: "completed",
  },
  {
    id: 4,
    title: "Φιλία Ελλάδας–Ισραήλ",
    date: "2015",
    content: "Πρόεδρος της Κοινοβουλευτικής Ομάδας φιλίας Ελλάδας–Ισραήλ.",
    icon: Users,
    relatedIds: [2, 3],
    status: "completed",
  },
];

const TITLE_BY_ID = new Map(CAREER_TIMELINE.map((item) => [item.id, item.title]));

export function PortalAboutCareerOrbit() {
  const [selectedId, setSelectedId] = useState<number>(0);

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8F6F1] p-5 shadow-sm sm:p-8">
      <ol className="relative m-0 list-none space-y-0 p-0">
        {CAREER_TIMELINE.map((item, index) => {
          const Icon = item.icon;
          const isLast = index === CAREER_TIMELINE.length - 1;
          const isSelected = selectedId === item.id;
          const isActive = item.status === "active";
          const related = item.relatedIds
            .map((id) => ({ id, title: TITLE_BY_ID.get(id) }))
            .filter((r): r is { id: number; title: string } => Boolean(r.title));

          return (
            <li key={item.id} className="relative flex gap-4 pb-8 last:pb-0 sm:gap-5">
              {/* Left rail: line + node */}
              <div className="relative flex w-10 shrink-0 flex-col items-center sm:w-12">
                {!isLast && (
                  <span
                    aria-hidden
                    className="absolute top-10 bottom-0 w-0.5 bg-[#C9A84C]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-label={item.title}
                  aria-pressed={isSelected}
                  className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#C9A84C] bg-white text-[#003476] shadow-sm transition hover:bg-[#C9A84C]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2 sm:h-12 sm:w-12"
                >
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#C9A84C] ring-2 ring-white"
                    >
                      <span className="absolute inset-0 animate-ping rounded-full bg-[#C9A84C] opacity-75" />
                    </span>
                  )}
                </button>
              </div>

              {/* Right: card */}
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`min-w-0 flex-1 rounded-xl border bg-white p-4 text-left shadow-sm transition sm:p-5 ${
                  isSelected || isActive
                    ? "border-[#C9A84C] bg-[#C9A84C]/5 ring-1 ring-[#C9A84C]/30"
                    : "border-[#E2E8F0] hover:border-[#C9A84C]/50"
                }`}
              >
                <span className="inline-flex rounded-full bg-[#C9A84C]/15 px-2.5 py-0.5 text-xs font-bold tracking-wide text-[#8B6914]">
                  {item.date}
                </span>
                <h3 className="mt-2 text-base font-bold text-[#003476] sm:text-lg">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {item.content}
                </p>
                {related.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {related.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex rounded-md border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                      >
                        {r.title}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
