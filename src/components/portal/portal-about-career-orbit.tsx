"use client";

import { Landmark, Megaphone, Scale, Users } from "lucide-react";
import {
  RadialOrbitalTimeline,
  type TimelineItem,
} from "@/components/radial-orbital-timeline";

const CAREER_TIMELINE: TimelineItem[] = [
  {
    id: 1,
    title: "Βουλευτής",
    date: "2009",
    content: "Βουλευτής Νέας Δημοκρατίας, Αιτωλοακαρνανία.",
    category: "politics",
    icon: Landmark,
    relatedIds: [2, 3],
    status: "completed",
    energy: 88,
  },
  {
    id: 2,
    title: "Υπ. Δικαιοσύνης",
    date: "2012",
    content: "Αναπληρωτής Υπουργός Δικαιοσύνης στην κυβέρνηση Σαμαρά.",
    category: "government",
    icon: Scale,
    relatedIds: [1, 4],
    status: "completed",
    energy: 92,
  },
  {
    id: 3,
    title: "Εκπρόσωπος Τύπου",
    date: "2015",
    content: "Εκπρόσωπος Τύπου της Νέας Δημοκρατίας.",
    category: "communications",
    icon: Megaphone,
    relatedIds: [1, 4],
    status: "completed",
    energy: 85,
  },
  {
    id: 4,
    title: "Φιλία Ελλάδας–Ισραήλ",
    date: "2015",
    content: "Πρόεδρος της Κοινοβουλευτικής Ομάδας φιλίας Ελλάδας–Ισραήλ.",
    category: "diplomacy",
    icon: Users,
    relatedIds: [2, 3],
    status: "completed",
    energy: 78,
  },
];

export function PortalAboutCareerOrbit() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] shadow-lg">
      <RadialOrbitalTimeline timelineData={CAREER_TIMELINE} />
    </div>
  );
}
