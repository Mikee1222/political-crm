"use client";

import { X } from "lucide-react";

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
  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-label="Συντομεύσεις"
      onMouseDown={() => onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Συντομεύσεις πληκτρολογίου</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
            aria-label="Κλείσιμο"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
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
      </div>
    </div>
  );
}
