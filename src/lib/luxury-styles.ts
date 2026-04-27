/** Command center / dark luxury design system — use CSS variables from globals.css */

export const lux = {
  /** @deprecated Prefer `<PageHeader />` for new screens */
  pageTitle: "text-2xl font-semibold tracking-tight text-[var(--text-page-title)] [text-shadow:0_1px_2px_rgba(0,0,0,0.15)] [data-theme='light']:[text-shadow:0_1px_0_rgba(255,255,255,0.5)]",
  sectionTitle: "text-base font-semibold text-[var(--text-card-title)]",
  body: "text-sm font-normal text-[var(--text-body)]",
  label:
    "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] [data-theme='light']:text-slate-600",
  pageBg: "min-h-full bg-[var(--bg-primary)]",
  pageAnimated: "hq-fade-in-up",
  cardTitle: "text-[13px] font-medium uppercase tracking-[0.08em] text-[var(--accent-gold)]",
  card:
    "data-hq-card hq-card-premium rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-[var(--text-body)] shadow-[0_4px_24px_rgba(0,0,0,0.4)]",
  cardFlat:
    "data-hq-card hq-card-premium rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-body)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]",
  input:
    "hq-form-control h-[42px] w-full min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-input)] placeholder:text-[var(--text-placeholder)] transition-[border-color,box-shadow] duration-150 ease-in-out focus:border-[var(--accent-gold)] focus:outline focus:outline-2 focus:outline-[var(--accent-gold)] focus:outline-offset-2 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
  inputError: "border-[var(--danger)] focus:border-[var(--danger)] focus:outline-[var(--danger)]",
  select:
    "hq-form-control h-[42px] w-full min-w-0 max-w-full cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 pr-10 text-sm text-[var(--text-input)] transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent-gold)] focus:outline focus:outline-2 focus:outline-[var(--accent-gold)] focus:outline-offset-2 focus:ring-0",
  textarea:
    "hq-form-control min-h-[100px] w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-input)] placeholder:text-[var(--text-placeholder)] transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent-gold)] focus:outline focus:outline-2 focus:outline-[var(--accent-gold)] focus:outline-offset-2 focus:ring-0 disabled:opacity-50",
  dateInput:
    "hq-form-control h-[42px] w-full min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-input)] transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent-gold)] focus:outline focus:outline-2 focus:outline-[var(--accent-gold)] focus:outline-offset-2 focus:ring-0 disabled:opacity-50 [color-scheme:dark]",
  /** Gold fill — spec: #C9A84C background, #0A0F1A text (≥4.5:1) */
  btnPrimary:
    "btn-scale hq-btn-gold-glow inline-flex items-center justify-center gap-2 rounded-lg border border-[#C9A84C] bg-gradient-to-b from-[#C9A84C] to-[#8b6914] px-4 py-2.5 text-sm font-bold text-[var(--text-badge-on-gold)] shadow-sm transition duration-150 hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  btnSecondary:
    "btn-scale inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--text-body)] transition duration-150 hover:bg-[var(--bg-elevated)] active:scale-[0.98] disabled:opacity-50",
  btnDanger:
    "btn-scale inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-200 transition duration-150 hover:bg-red-500/30 active:scale-[0.98] disabled:opacity-50",
  btnGold:
    "btn-scale hq-btn-gold-glow inline-flex items-center justify-center gap-2 rounded-lg border border-[#C9A84C] bg-gradient-to-b from-[#C9A84C] to-[#8b6914] px-4 py-2.5 text-sm font-bold text-[var(--text-badge-on-gold)] shadow-sm transition duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-50",
  /** Primary action on blue: #003476, white text */
  btnBlue:
    "btn-scale inline-flex items-center justify-center gap-2 rounded-lg border border-[#003476] bg-[#003476] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  btnIcon:
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition duration-150 hover:border-[var(--border-hover)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] active:scale-[0.98]",
  topBar: "h-[60px] border-b border-[var(--border)] bg-[var(--topbar-bg)] backdrop-blur-[20px]",
  tableHead:
    "bg-[var(--bg-elevated)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-table-header)]",
  tableRow:
    "cursor-pointer border-b border-[var(--border)] text-[var(--text-table)] transition-colors duration-150 last:border-0 hover:bg-[var(--bg-elevated)]/80",
  /** Legacy overlay — prefer `<CenteredModal />`. z-index 9999, centered panel, max-height 90vh. */
  modalOverlay:
    "fixed inset-0 z-[9999] flex min-h-full items-center justify-center overflow-y-auto overflow-x-hidden p-4 backdrop-blur-[8px] [background:var(--overlay-scrim)]",
  modalPanel:
    "hq-modal-panel relative flex w-full max-w-full max-h-[90vh] flex-col overflow-y-auto overflow-x-hidden border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl sm:max-w-[680px] sm:rounded-2xl",
  fieldError: "mt-1 text-xs text-red-400",
} as const;

export const callStatusPill: Record<string, string> = {
  Pending: "bg-[var(--status-waiting-bg)] text-[var(--status-waiting-text)] ring-1 ring-inset ring-[var(--status-waiting-text)]/25",
  Positive: "bg-[var(--status-positive-bg)] text-[var(--status-positive-text)] ring-1 ring-inset ring-[var(--status-positive-text)]/30",
  Negative: "bg-[var(--status-negative-bg)] text-[var(--status-negative-text)] ring-1 ring-inset ring-[var(--status-negative-text)]/30",
  "No Answer": "bg-[var(--status-noanswer-bg)] text-[var(--status-noanswer-text)] ring-1 ring-inset ring-[var(--status-noanswer-text)]/30",
};

export const priorityPill: Record<string, string> = {
  High: "bg-red-500/15 text-[var(--status-negative-text)] ring-1 ring-inset ring-red-500/30",
  Medium: "bg-[var(--status-noanswer-bg)] text-[var(--status-noanswer-text)] ring-1 ring-inset ring-amber-500/25",
  Low: "bg-[var(--status-waiting-bg)] text-[var(--status-waiting-text)] ring-1 ring-inset ring-slate-500/20",
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
