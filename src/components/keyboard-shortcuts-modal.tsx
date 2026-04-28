"use client";

import { CenteredModal } from "@/components/ui/centered-modal";

const rows: { k: string; d: string }[] = [
  { k: "⌘/Ctrl + K", d: "Καθολική αναζήτηση" },
  { k: "⌘/Ctrl + N", d: "Νέα επαφή (σελίδα Επαφές)" },
  { k: "⌘/Ctrl + /", d: "Βοήθεια συντομεύσεων" },
  { k: "Esc", d: "Κλείσιμο αναζήτησης / παράθυρου" },
  { k: "G μετά D", d: "Dashboard" },
  { k: "G μετά C", d: "Επαφές" },
  { k: "G μετά R", d: "Αιτήματα" },
  { k: "G μετά A", d: "Αλεξάνδρα" },
  { k: "⌘/Ctrl + Shift + A", d: "Φωνητική Αλεξάνδρα" },
];

type Props = { open: boolean; onClose: () => void };

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  return (
    <CenteredModal
      open={open}
      onClose={onClose}
      title="Συντομεύσεις πληκτρολογίου"
      ariaLabel="Συντομεύσεις πληκτρολογίου"
      className="!max-w-md"
    >
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.k + r.d}
            className="flex flex-col gap-0.5 border-b border-[var(--border)]/40 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <kbd className="font-mono text-sm font-semibold text-[#C9A84C]">{r.k}</kbd>
            <span className="text-sm text-[var(--text-secondary)]">{r.d}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs text-[var(--text-muted)]">Esc — κλείσιμο</p>
    </CenteredModal>
  );
}
