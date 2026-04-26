/** Command center / dark luxury design system — use CSS variables from globals.css */

export const lux = {
  pageTitle: "text-2xl font-semibold tracking-tight text-[var(--text-primary)]",
  sectionTitle: "text-base font-semibold text-[var(--text-primary)]",
  body: "text-sm font-normal text-[var(--text-primary)]",
  label:
    "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]",
  pageBg: "min-h-full bg-[var(--bg-primary)]",
  pageAnimated: "hq-fade-in-up",
  cardTitle: "text-[13px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]",
  card:
    "data-hq-card rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-[var(--text-primary)] shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-hover)]",
  cardFlat:
    "data-hq-card rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[0_4px_24px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-hover)]",
  input:
    "h-[42px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-150 ease-in-out focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/20 disabled:cursor-not-allowed disabled:opacity-50",
  inputError: "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]/20",
  select:
    "h-[42px] w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)] transition-all duration-150 focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/20",
  textarea:
    "min-h-[100px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-all duration-150 focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/20 disabled:opacity-50",
  btnPrimary:
    "btn-scale inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--accent-gold)] bg-gradient-to-b from-[var(--accent-gold)] to-[#8b6914] px-4 py-2.5 text-sm font-bold text-[#0a0f1a] shadow-sm transition duration-150 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  btnSecondary:
    "btn-scale inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition duration-150 hover:bg-[var(--bg-elevated)] active:scale-[0.98] disabled:opacity-50",
  btnDanger:
    "btn-scale inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-200 transition duration-150 hover:bg-red-500/30 active:scale-[0.98] disabled:opacity-50",
  btnGold:
    "btn-scale inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--accent-gold)] bg-gradient-to-b from-[var(--accent-gold)] to-[#8b6914] px-4 py-2.5 text-sm font-bold text-[#0a0f1a] shadow-sm transition duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50",
  btnIcon:
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition duration-150 hover:border-[var(--border-hover)] hover:bg-[var(--bg-card)] hover:text-[var(--accent-gold-light)] active:scale-[0.98]",
  topBar: "h-[60px] border-b border-[var(--border)] bg-[rgba(5,13,26,0.8)] backdrop-blur-[20px]",
  tableHead:
    "bg-[var(--bg-elevated)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
  tableRow:
    "cursor-pointer border-b border-[var(--border)] transition-colors duration-150 last:border-0 hover:bg-[var(--bg-elevated)]/80",
  modalOverlay:
    "fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-[8px] sm:items-center sm:p-4",
  modalPanel:
    "hq-modal-panel flex min-h-[100dvh] w-full max-w-full flex-col overflow-hidden rounded-none border-0 border-[var(--border)] bg-[var(--bg-card)] shadow-2xl sm:min-h-0 sm:max-h-[90vh] sm:max-w-[680px] sm:rounded-2xl sm:border",
} as const;

export const callStatusPill: Record<string, string> = {
  Pending: "bg-[rgba(100,116,139,0.2)] text-[#94A3B8] ring-1 ring-inset ring-[rgba(100,116,139,0.4)]",
  Positive: "bg-[rgba(16,185,129,0.15)] text-[#10B981] ring-1 ring-inset ring-[rgba(16,185,129,0.3)]",
  Negative: "bg-[rgba(239,68,68,0.15)] text-[#EF4444] ring-1 ring-inset ring-[rgba(239,68,68,0.3)]",
  "No Answer": "bg-[rgba(245,158,11,0.15)] text-[#F59E0B] ring-1 ring-inset ring-[rgba(245,158,11,0.3)]",
};

export const priorityPill: Record<string, string> = {
  High: "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30",
  Medium: "bg-[var(--warning)]/15 text-[var(--warning)] ring-1 ring-inset ring-[var(--warning)]/30",
  Low: "bg-slate-500/15 text-[var(--text-secondary)] ring-1 ring-inset ring-slate-500/30",
};

export function callStatusLabel(key: string | null | undefined): string {
  const m: Record<string, string> = {
    Pending: "Αναμονή",
    Positive: "Θετικός",
    Negative: "Αρνητικός",
    "No Answer": "Δεν Απάντησε",
  };
  return m[key ?? "Pending"] ?? (key || "—");
}

/** Avatar: gold gradient circle, white initials (contacts table etc.) */
export const avatarContact =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-xs font-bold text-white shadow-sm";
