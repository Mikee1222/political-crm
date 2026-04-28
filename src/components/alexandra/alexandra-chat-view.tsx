"use client";

import Link from "next/link";
import { Calendar, Menu, Mic, Paperclip, Send, Phone, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { hasMinRole, type Role } from "@/lib/roles";
import { buildImportPreviewMessage, parseSpreadsheetToRows } from "@/lib/alexandra-sheet-parse";
import { useAlexandraVoiceConversation } from "@/hooks/use-alexandra-voice-conversation";
import { AlexandraVoiceModeOverlay } from "./alexandra-voice-mode-overlay";
import ReactMarkdown from "react-markdown";
import { callStatusLabel, callStatusPill, lux } from "@/lib/luxury-styles";
import {
  SUGGESTED_CHIPS,
  greekToolLabel,
  canConfirmCreate,
  canConfirmStartCall,
  canExecuteAction,
  fmtTime,
  fmtRelativeTime,
  initialsName,
  type FindRow,
  type Msg,
  type RowConv,
} from "./alexandra-chat-helpers";
import { useAlexandraSpeechToText } from "@/hooks/use-alexandra-speech-to-text";
import { useAlexandraChat, type BriefingToday } from "./alexandra-chat-provider";
import { AlexandraActivityPanel } from "./alexandra-activity-panel";
import { HqSelect } from "@/components/ui/hq-select";
import { CenteredModal } from "@/components/ui/centered-modal";
import { useFormToast } from "@/contexts/form-toast-context";

function isBriefingReady(b: BriefingToday | "loading" | null): b is BriefingToday {
  return b != null && b !== "loading";
}

function BriefingDetails({ b }: { b: BriefingToday }) {
  const nd = b.namedays;
  const names = nd.names.length ? nd.names.join(", ") : "—";
  return (
    <>
      <p className="text-xs text-[var(--text-muted)]">
        {new Date().toLocaleDateString("el-GR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
      <p className="mt-2 text-sm">
        Σήμερα γιορτάζουν: {names}
        {nd.matchingContactsCount > 0 && (
          <span className="text-[var(--text-secondary)]"> ({nd.matchingContactsCount} επαφές στη βάση)</span>
        )}
      </p>
      <p className="mt-1.5">Έχεις {b.pendingTasksCount ?? 0} εκκρεμείς εργασίες</p>
      <p className="mt-1.5">Υπάρχουν {b.openRequestsCount} ανοιχτά αιτήματα</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={nd.matchingContactsCount ? "/contacts" : "/namedays"}
          className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-blue)] px-3 py-1.5 text-xs font-medium text-[var(--text-sidebar-active)] transition duration-200 hover:opacity-90"
        >
          <Phone className="h-3.5 w-3.5" />
          Κάλεσε τους εορτάζοντες
        </Link>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hover)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition duration-200 hover:bg-[var(--bg-elevated)]"
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          Δες τις εργασίες
        </Link>
      </div>
    </>
  );
}

export function AlexandraChatView({ mode }: { mode: "page" | "mini" }) {
  const { showToast } = useFormToast();
  const {
    role, conversations, selectedId, setSelectedId, messages, loading,
    listLoading, messagesLoading, input, setInput, error, toDelete, setToDelete,
    setError, hoveredId, setHoveredId, sideOpen, setSideOpen, streamMode, bottomRef, newConversation,
    deleteConv, execute, send, startWithChip, confirmStartCall, rejectStartCall, rejectCreate, selectConversation, currentTitle, showChips, enterMiniFromPage,
    loadList, loadMessages, setSpreadsheetImport, leftPanelTab, setLeftPanelTab, briefingToday, contactPageContext, openMiniFromBubble,
  } = useAlexandraChat();
  const canSeeBriefing = hasMinRole(role as Role | null | undefined, "manager");
  const canSeeActivity = hasMinRole(role as Role | null | undefined, "manager");
  const pendingVoiceStart = useRef(false);

  const importFileInputRef = useRef<HTMLInputElement>(null);
  const canImportSpreadsheet = hasMinRole(role as Role | null | undefined, "manager");

  const voiceModeConfigured = Boolean(
    process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID && process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID.length > 0,
  );
  const onAfterVoice = useCallback(async () => {
    if (!selectedId) return;
    await loadMessages(selectedId, { silent: true });
    await loadList();
  }, [loadList, loadMessages, selectedId]);
  const {
    open: voiceOpen,
    uiPhase: voicePhase,
    transcript: voiceTranscript,
    error: voiceError,
    muted: voiceMuted,
    startVoice,
    endVoice,
    toggleMute: voiceToggleMute,
  } = useAlexandraVoiceConversation(selectedId, { onAfterPersist: onAfterVoice });

  useEffect(() => {
    if (pendingVoiceStart.current && selectedId && voiceModeConfigured) {
      pendingVoiceStart.current = false;
      void startVoice();
    }
  }, [selectedId, startVoice, voiceModeConfigured]);

  useEffect(() => {
    const h = () => {
      if (!voiceModeConfigured) return;
      if (!selectedId) {
        pendingVoiceStart.current = true;
        void newConversation();
        return;
      }
      void startVoice();
    };
    window.addEventListener("alexandra-voice-shortcut", h);
    return () => window.removeEventListener("alexandra-voice-shortcut", h);
  }, [selectedId, newConversation, startVoice, voiceModeConfigured]);

  const { supported: sttSupported, isRecording: sttRecording, toggle: sttToggle } = useAlexandraSpeechToText(
    input,
    setInput,
    loading || streamMode !== "none",
  );

  const onImportSpreadsheetChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !canImportSpreadsheet) return;
      try {
        const buf = await file.arrayBuffer();
        const p = parseSpreadsheetToRows(buf);
        if (p.columns.length === 0 || p.rows.length === 0) {
          const msg = "Κενό αρχείο· δεν βρέθηκαν γραμμές";
          setError(msg);
          showToast(msg, "error");
          return;
        }
        let convId: string | null = selectedId;
        if (!convId) {
          convId = await newConversation();
          if (!convId) return;
        }
        setSpreadsheetImport({
          conversationId: convId,
          rows: p.rows as Array<Record<string, unknown>>,
          fileName: file.name,
          sheetName: p.sheetName,
        });
        const text = buildImportPreviewMessage(file.name, p.columns, p.previewRows, {
          headerRowIndex: p.headerRowIndex,
          sheetName: p.sheetName,
        });
        void send(text, convId);
        showToast("Το υπολογιστικό φύλλο φορτώθηκε για προεπισκόπηση.", "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Σφάλμα αναγνώρισης αρχείου";
        setError(msg);
        showToast(msg, "error");
      }
    },
    [canImportSpreadsheet, newConversation, selectedId, send, setError, setSpreadsheetImport, showToast],
  );

  const onChatDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canImportSpreadsheet) return;
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const ext = file.name.toLowerCase();
      if (!/\.(xlsx|xls|csv)$/.test(ext) && !file.type.includes("spreadsheet") && !file.type.includes("csv")) {
        showToast("Μόνο αρχεία .xlsx, .xls ή .csv.", "error");
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const p = parseSpreadsheetToRows(buf);
        if (p.columns.length === 0 || p.rows.length === 0) {
          const msg = "Κενό αρχείο";
          setError(msg);
          showToast(msg, "error");
          return;
        }
        let convId: string | null = selectedId;
        if (!convId) {
          convId = await newConversation();
          if (!convId) return;
        }
        setSpreadsheetImport({
          conversationId: convId,
          rows: p.rows as Array<Record<string, unknown>>,
          fileName: file.name,
          sheetName: p.sheetName,
        });
        const text = buildImportPreviewMessage(file.name, p.columns, p.previewRows, {
          headerRowIndex: p.headerRowIndex,
          sheetName: p.sheetName,
        });
        void send(text, convId);
        showToast("Το υπολογιστικό φύλλο φορτώθηκε για προεπισκόπηση.", "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Σφάλμα";
        setError(msg);
        showToast(msg, "error");
      }
    },
    [canImportSpreadsheet, newConversation, selectedId, send, setError, setSpreadsheetImport, showToast],
  );

  return (
    <div
      className={
        mode === "page"
          ? "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden -mx-3 sm:-mx-6 md:-mx-8 border border-[var(--border)] bg-[var(--bg-primary)] shadow-[var(--card-shadow)] md:rounded-t-xl"
          : "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-[var(--card-shadow)]"
      }
    >
      {mode === "page" && (
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5">
          <button
            type="button"
            onClick={enterMiniFromPage}
            className="btn-scale rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--accent-gold)] transition duration-200 hover:border-[var(--border-hover)]"
          >
            Mini
          </button>
        </div>
      )}
      {mode === "page" && sideOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 md:hidden [background:var(--overlay-scrim)]"
          aria-label="Κλείσιμο"
          onClick={() => setSideOpen(false)}
        />
      )}
      <div
        className={
          mode === "page"
            ? "flex w-full min-h-0 min-w-0 flex-1 flex-col md:flex-row"
            : "flex min-h-0 min-w-0 flex-1 flex-col"
        }
      >
        {/* left — 280px — κινητό: συρόμενο πάνελ */}
        {mode === "page" && (
        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-[min(100%,300px)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] transition-transform duration-200 md:relative md:inset-auto md:z-0 md:w-[300px] md:translate-x-0",
            sideOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          ].join(" ")}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--accent-gold)_8%,transparent)] to-transparent"
            aria-hidden
          />
          <div className="relative z-10 flex shrink-0 items-start gap-3 p-4 pb-2 pr-2">
            <div className="alex-avatar-gold alex-avatar-gold--48 hq-pulse-gold shadow-lg">A</div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-bold tracking-tight text-[var(--text-primary)]">Αλεξάνδρα</h2>
              <p className="text-xs font-medium text-[var(--accent-gold)]">AI Γραμματέας</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-[var(--text-secondary)] transition duration-200 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] md:hidden"
              onClick={() => setSideOpen(false)}
              aria-label="Κλείσιμο"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {canSeeActivity && (
            <div className="relative z-10 flex shrink-0 border-b border-[var(--border)] px-2">
              <button
                type="button"
                onClick={() => setLeftPanelTab("chats")}
                className={[
                  "min-h-[44px] flex-1 rounded-t-lg py-2 text-center text-xs font-semibold transition duration-200",
                  leftPanelTab === "chats"
                    ? "text-[var(--accent-gold)] [box-shadow:inset_0_-2px_0_var(--accent-gold)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                Συνομιλίες
              </button>
              <button
                type="button"
                onClick={() => setLeftPanelTab("activity")}
                className={[
                  "min-h-[44px] flex-1 rounded-t-lg py-2 text-center text-xs font-semibold transition duration-200",
                  leftPanelTab === "activity"
                    ? "text-[var(--accent-gold)] [box-shadow:inset_0_-2px_0_var(--accent-gold)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                Ιστορικό ενεργειών
              </button>
            </div>
          )}
          {leftPanelTab === "chats" || !canSeeActivity ? (
            <>
              <div className="relative z-10 shrink-0 px-3 pb-3 pt-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void newConversation()}
                  className={lux.btnPrimary + " w-full !py-2.5 text-sm transition duration-200 disabled:opacity-50"}
                >
                  + Νέα συνομιλία
                </button>
              </div>
              <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
                {listLoading && <p className="px-2 text-xs text-[var(--text-muted)]">Φόρτωση…</p>}
                {!listLoading && conversations.length === 0 && (
                  <p className="px-2 py-12 text-center text-sm text-[var(--text-secondary)]">
                    Καμία συνομιλία ακόμη.
                    <br />
                    <span className="text-xs text-[var(--text-muted)]">Ξεκινήστε μια νέα από το κουμπί παραπάνω.</span>
                  </p>
                )}
                {conversations.map((c: RowConv) => {
                  const active = selectedId === c.id;
                  const relT = c.last_message_at
                    ? fmtRelativeTime(c.last_message_at)
                    : fmtRelativeTime(c.updated_at);
                  return (
                    <div
                      key={c.id}
                      className="group relative border-b border-[var(--accent-gold)]/15 last:border-0"
                      onMouseEnter={() => setHoveredId(c.id)}
                      onMouseLeave={() => setHoveredId((h: string | null) => (h === c.id ? null : h))}
                    >
                      <button
                        type="button"
                        onClick={() => selectConversation(c.id)}
                        className={[
                          "w-full rounded-lg border-l-[3px] border-solid px-3 py-2.5 text-left text-sm transition duration-200",
                          active
                            ? "border-l-[color:var(--accent-gold)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                            : "border-l-[color:transparent] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]",
                        ].join(" ")}
                      >
                        <p className={"line-clamp-1 font-medium " + (active ? "text-[var(--text-primary)]" : "")}>
                          {c.title || "Νέα συνομιλία"}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--accent-gold)]">{relT}</p>
                        {c.last_message_preview && (
                          <p className="mt-1 line-clamp-1 text-[11px] text-[var(--text-muted)]">{c.last_message_preview}</p>
                        )}
                      </button>
                      {hoveredId === c.id && (
                        <button
                          type="button"
                          title="Διαγραφή"
                          onClick={(e) => {
                            e.stopPropagation();
                            setToDelete(c);
                          }}
                          className="absolute right-1.5 top-2 rounded-md p-1.5 text-[var(--text-muted)] opacity-0 transition duration-200 group-hover:opacity-100 hover:bg-[var(--bg-elevated)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
              <AlexandraActivityPanel />
            </div>
          )}
        </aside>
        )}

        {/* right — πλήρες πλάτος chat σε κινητό */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
          {mode === "mini" && (
            <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5">
              <label className="sr-only" htmlFor="alexa-mini-conv">Συνομιλία</label>
              <HqSelect
                id="alexa-mini-conv"
                wrapperClassName="min-w-0 flex-1"
                className="!h-8 min-w-0 flex-1 cursor-pointer !rounded-lg !border-[var(--border)] !bg-[var(--bg-elevated)] !px-2 !py-1 !text-xs text-[var(--text-primary)] transition duration-200"
                value={selectedId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) selectConversation(v);
                  else setSelectedId(null);
                }}
              >
                <option value="">— Συνομιλία —</option>
                {conversations.map((c: RowConv) => (
                  <option key={c.id} value={c.id}>
                    {c.title || "Νέα συνομιλία"}
                  </option>
                ))}
              </HqSelect>
              <button
                type="button"
                onClick={() => void newConversation()}
                disabled={loading}
                className="shrink-0 rounded-lg border border-[var(--border-hover)] px-2 py-1 text-[10px] font-semibold text-[var(--accent-gold)] transition duration-200 hover:bg-[var(--bg-elevated)] disabled:opacity-50"
              >
                +Νεα
              </button>
            </div>
          )}
          {selectedId && (
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-primary)] px-3 py-3 sm:px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {mode === "page" && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-primary)] transition duration-200 hover:bg-[var(--bg-elevated)] md:hidden"
                  onClick={() => setSideOpen(true)}
                  aria-label="Συνομιλίες"
                >
                  <Menu className="h-5 w-5" />
                </button>
                )}
                <h3 className="min-w-0 flex-1 truncate text-base font-bold text-[var(--text-primary)]">{currentTitle || "Νέα συνομιλία"}</h3>
              </div>
              <button
                type="button"
                onClick={() => void newConversation()}
                disabled={loading}
                className="shrink-0 rounded-lg border border-[var(--border-hover)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--accent-gold)] transition duration-200 hover:bg-[var(--accent-gold)] hover:text-[var(--text-badge-on-gold)] disabled:opacity-50"
              >
                Νέα
              </button>
            </header>
          )}
          {mode === "page" && !selectedId && (
            <div className="flex shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 md:hidden">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-primary)] transition duration-200 hover:bg-[var(--bg-elevated)]"
                onClick={() => setSideOpen(true)}
                aria-label="Μενού συνομιλιών"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          )}

          <div
            className="min-h-0 flex-1 overflow-y-auto"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={onChatDrop}
          >
            {!selectedId && mode === "page" && (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="alex-hero-a-circle hq-pulse-gold flex h-28 w-28 items-center justify-center rounded-full text-3xl font-bold alex-hero-glow">
                  A
                </div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Καλησπέρα! Είμαι η Αλεξάνδρα</h2>
                <p className="max-w-md text-sm text-[var(--accent-gold)]">Η AI γραμματέας του γραφείου Καραγκούνη</p>
                <div className="mt-2 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SUGGESTED_CHIPS.map((c) => (
                    <button
                      key={c.text}
                      type="button"
                      disabled={loading}
                      onClick={() => void startWithChip(c.text)}
                      className="flex items-start gap-2 rounded-2xl border border-[var(--border-hover)] bg-[var(--bg-primary)] px-3 py-2.5 text-left text-xs text-[var(--accent-gold)] transition duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                    >
                      <c.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>{c.text}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)]">Ή ξεκινήστε με «+ Νέα συνομιλία» αριστερά.</p>
                <button
                  type="button"
                  onClick={() => void newConversation()}
                  disabled={loading}
                  className={lux.btnPrimary + " mt-2 !rounded-full px-6 transition duration-200 disabled:opacity-50"}
                >
                  + Νέα συνομιλία
                </button>
              </div>
            )}
            {!selectedId && mode === "mini" && (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="alex-hero-a-circle hq-pulse-gold flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold">
                  A
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Αλεξάνδρα</p>
                <p className="text-xs text-[var(--accent-gold)]">Επίλεξε συνομιλία ή +Νεα.</p>
              </div>
            )}

            {selectedId && messagesLoading && (
              <div className="flex h-40 items-center justify-center p-6 text-sm text-[var(--text-secondary)]">Φόρτωση…</div>
            )}
            {selectedId && !messagesLoading && messages.length === 0 && streamMode === "none" && mode === "page" && (
              <div className="space-y-4 px-4 py-5">
                {contactPageContext && (
                  <p className="text-center text-[15px] leading-relaxed text-[var(--text-primary)]">
                    Βλέπω ότι κοιτάς την επαφή <strong className="text-[var(--accent-gold)]">{contactPageContext.contactName}</strong>.
                    Τι θέλεις να κάνω;
                  </p>
                )}
                <div className="mx-auto flex max-w-lg flex-col items-center text-center">
                  <div className="alex-hero-a-circle hq-pulse-gold mb-3 flex h-32 w-32 items-center justify-center rounded-full text-4xl font-bold alex-hero-glow">
                    A
                  </div>
                  <h2 className="text-[24px] font-semibold text-[var(--text-primary)]">Καλησπέρα! Είμαι η Αλεξάνδρα</h2>
                  <p className="mt-1 text-sm text-[var(--accent-gold)]">Η AI γραμματέας του γραφείου Καραγκούνη</p>
                </div>
                <div className="mx-auto grid max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SUGGESTED_CHIPS.map((c) => (
                    <button
                      key={c.text}
                      type="button"
                      disabled={loading}
                      onClick={() => void send(c.text)}
                      className="flex items-start gap-2.5 rounded-2xl border border-[var(--border-hover)] bg-[var(--bg-primary)] px-3.5 py-3 text-left text-sm text-[var(--accent-gold)] shadow-sm transition duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                    >
                      <c.icon className="mt-0.5 h-4 w-4 shrink-0 opacity-90" />
                      {c.text}
                    </button>
                  ))}
                </div>
                {canSeeBriefing && (
                  <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left text-sm text-[var(--text-primary)] shadow-sm">
                    <p className="mb-2 flex items-center gap-2 font-semibold text-[var(--accent-gold)]">
                      <Calendar className="h-4 w-4" />
                      Σημείωση ημέρας
                    </p>
                    {briefingToday === "loading" && <p className="text-xs text-[var(--text-muted)]">Φόρτωση…</p>}
                    {isBriefingReady(briefingToday) && <BriefingDetails b={briefingToday} />}
                  </div>
                )}
              </div>
            )}
            {selectedId && !messagesLoading && mode === "mini" && messages.length === 0 && streamMode === "none" && (
              <p className="px-3 py-3 text-center text-xs text-[var(--text-muted)]">Γράψε εντολή παρακάτω — ή άνοιξε «Νέα».</p>
            )}
            {selectedId && !messagesLoading && messages.map((m: Msg & { _createdAt?: string }) => (
              <div key={m.id} className="px-4 py-2">
                <div className={m.role === "user" ? "flex flex-col items-end" : "flex items-start gap-2"}>
                  {m.role === "assistant" && (
                    <span className="alex-avatar-gold alex-avatar-gold--32 mt-0.5">A</span>
                  )}
                  <div
                    className={
                      m.role === "user"
                        ? "ml-auto w-full min-w-0 max-w-[75%]"
                        : "min-w-0 w-full max-w-[80%] flex-1"
                    }
                  >
                    {m.role === "assistant" && m.contextLabel && (
                      <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{m.contextLabel}</span>
                    )}
                    <div
                      className={
                        m.role === "user"
                          ? "rounded-[20px] rounded-br-[4px] bg-[var(--accent-gold)] px-4 py-2.5 text-sm font-medium text-[var(--text-badge-on-gold)] shadow-sm transition duration-200"
                          : "rounded-[20px] rounded-bl-[4px] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] shadow-sm transition duration-200"
                      }
                    >
                      {m.role === "user" ? (
                        <p className="whitespace-pre-wrap text-[var(--text-badge-on-gold)]">{m.content}</p>
                      ) : (
                        <>
                          <div className="ai-md max-w-none text-sm">
                            {m.isStreaming && !m.content ? (
                              <span className="text-[var(--text-muted)]"> </span>
                            ) : (
                              <ReactMarkdown>{m.content || "—"}</ReactMarkdown>
                            )}
                            {m.isStreaming ? (
                              <span
                                className="ai-stream-cursor inline-block h-4 w-0.5 rounded-sm align-middle bg-[var(--accent-gold)]"
                                aria-hidden
                              />
                            ) : null}
                          </div>
                          {m.streamMeta?.bulkProgress && (
                            <p className="mt-1.5 text-xs font-medium text-[var(--accent-gold)]">
                              Δημιουργώ επαφές… {m.streamMeta.bulkProgress.current}/
                              {m.streamMeta.bulkProgress.total}
                            </p>
                          )}
                          {(() => {
                            const tools = Array.from(
                              new Set(
                                [
                                  ...(m.toolsExecutedFromDb ?? []),
                                  ...(m.streamMeta?.executed ?? []),
                                ].filter(Boolean),
                              ),
                            );
                            if (tools.length === 0) return null;
                            return (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {tools.map((t) => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center gap-0.5 rounded-md border border-[var(--status-positive-text)]/30 bg-[var(--status-positive-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--status-positive-text)] transition duration-200"
                                  >
                                    ✓ Εκτελέστηκε · {greekToolLabel(t)}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                          {m.findResults && m.findResults.length > 0 && (() => {
                            const all = m.findResults;
                            const list = all.slice(0, 5);
                            const hasMore = all.length > 5;
                            return (
                            <ul className="mt-2 space-y-1.5 border-t border-dashed border-[var(--border)] pt-2">
                              {list.map((c: FindRow) => (
                                <li key={c.id}>
                                  <Link
                                    href={`/contacts/${c.id}`}
                                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-1.5 text-left transition hover:bg-[var(--bg-elevated)]"
                                  >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-blue)] text-[10px] font-bold text-[var(--text-metric-value)]">
                                      {initialsName(c.first_name, c.last_name)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-[var(--text-primary)]">
                                        {c.first_name} {c.last_name}
                                      </p>
                                      <p className="font-mono text-[10px] text-[var(--text-secondary)]">{c.phone || "—"}</p>
                                    </div>
                                    {c.call_status && (
                                      <span
                                        className={
                                          "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold " + (callStatusPill[c.call_status] ?? callStatusPill.Pending)
                                        }
                                      >
                                        {callStatusLabel(c.call_status ?? undefined)}
                                      </span>
                                    )}
                                  </Link>
                                </li>
                              ))}
                              {hasMore && (
                                <li className="pt-0.5 text-right">
                                  <Link href="/contacts" className="text-xs font-medium text-[var(--accent-gold)] hover:underline">
                                    Δες όλα →
                                  </Link>
                                </li>
                              )}
                            </ul>
                            );
                          })()}
                          {m.filterUrl && (
                            <div className="mt-2 border-t border-dashed border-[var(--border)] pt-2">
                              <Link
                                href={m.filterUrl}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-blue)] px-3 py-2 text-center text-xs font-semibold text-[var(--text-metric-value)] transition duration-200 hover:opacity-90"
                              >
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                Δείξε στις Επαφές
                              </Link>
                            </div>
                          )}
                          {m.pendingAction && m.startCallMeta && canConfirmStartCall(role, m.pendingAction) && m.pendingAction.action === "start_call" && (
                            <div className="mt-2 space-y-2 border-t border-dashed border-[var(--border)] pt-2">
                              <p className="text-xs text-[var(--text-primary)]">
                                Να ξεκινήσω κλήση στον <strong>{m.startCallMeta.name}</strong> ({m.startCallMeta.phone});
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => void confirmStartCall(m.id)}
                                  className="flex-1 rounded-lg bg-[var(--accent-blue)] py-1.5 text-xs font-semibold text-[var(--text-metric-value)] transition duration-200 hover:opacity-90 disabled:opacity-50"
                                >
                                  Ναι
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectStartCall(m.id)}
                                  className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs font-medium text-[var(--text-secondary)] transition duration-200 hover:bg-[var(--bg-elevated)]"
                                >
                                  Όχι
                                </button>
                              </div>
                            </div>
                          )}
                          {m.pendingAction && canConfirmCreate(role, m.pendingAction) && m.pendingAction.action === "create_contact" && (
                            <div className="mt-2 space-y-2 border-t border-dashed border-[var(--border)] pt-2">
                              <p className="text-[10px] uppercase text-[var(--text-muted)]">Νέα επαφή — σύνοψη</p>
                              <pre className="mb-1 max-h-20 overflow-auto rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-secondary)]">{JSON.stringify(m.pendingAction.data, null, 2)}</pre>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => void execute(m.id)}
                                  className={lux.btnPrimary + " flex-1 !py-1.5 !text-xs disabled:opacity-50"}
                                >
                                  Εκτέλεση
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectCreate(m.id)}
                                  className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs text-[var(--text-secondary)] transition duration-200 hover:bg-[var(--bg-elevated)]"
                                >
                                  Ακύρωση
                                </button>
                              </div>
                            </div>
                          )}
                          {m.pendingAction && !m.executed && canExecuteAction(role, m.pendingAction) && m.pendingAction.action === "update_status" && (
                            <div className="mt-2 border-t border-dashed border-[var(--border)] pt-2">
                              <pre className="mb-1 max-h-20 overflow-auto rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-secondary)]">{JSON.stringify(m.pendingAction, null, 0)}</pre>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => void execute(m.id)}
                                className={lux.btnPrimary + " w-full !py-1.5 !text-xs disabled:opacity-50"}
                              >
                                Εκτέλεση
                              </button>
                            </div>
                          )}
                          {m.pendingAction &&
                            !m.executed &&
                            m.pendingAction.action !== "update_status" &&
                            m.pendingAction.action !== "start_call" &&
                            m.pendingAction.action !== "create_contact" &&
                            canExecuteAction(role, m.pendingAction) && (
                              <div className="mt-2 border-t border-dashed border-[var(--border)] pt-2">
                                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Προτεινόμενη ενέργεια</p>
                                <pre className="mb-2 max-h-24 overflow-auto rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-secondary)]">{JSON.stringify(m.pendingAction, null, 0)}</pre>
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => void execute(m.id)}
                                  className={lux.btnPrimary + " w-full !py-1.5 !text-xs disabled:opacity-50"}
                                >
                                  Εκτέλεση
                                </button>
                              </div>
                            )}
                          {m.pendingAction && !m.executed && !canExecuteAction(role, m.pendingAction) && m.pendingAction.action !== "start_call" && m.pendingAction.action !== "create_contact" && (
                            <p className="mt-2 text-xs text-[var(--status-noanswer-text)]">Δεν έχετε δικαίωμα· ρωτήστε υπεύθυνο.</p>
                          )}
                        </>
                      )}
                    </div>
                    <p
                      className={
                        m.role === "user" ? "mt-1 text-right text-[10px] text-[var(--text-muted)]" : "mt-1 text-[10px] text-[var(--text-muted)]"
                      }
                    >
                      {m._createdAt ? fmtTime(m._createdAt) : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {selectedId && streamMode === "typing" && (
              <div className="flex max-w-[80%] items-start gap-2 px-4 py-2">
                <span className="alex-avatar-gold alex-avatar-gold--32 mt-0.5">A</span>
                <div className="rounded-[20px] rounded-bl-[4px] border border-[var(--border)] bg-[var(--bg-card)] px-3.5 py-3 shadow-sm transition duration-200">
                  <div className="flex h-4 items-end gap-1" aria-hidden>
                    <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:0ms]" />
                    <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:150ms]" />
                    <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            {error && <p className="px-4 text-center text-xs text-[var(--status-negative-text)]">{error}</p>}
            <div ref={bottomRef} />
          </div>

          {selectedId && (
            <div
              className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)] p-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              {showChips && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {SUGGESTED_CHIPS.map((c) => (
                    <button
                      key={c.text}
                      type="button"
                      onClick={() => void send(c.text)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border-hover)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--accent-gold)] transition duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--bg-card)]"
                    >
                      <c.icon className="h-3 w-3 shrink-0 opacity-80" />
                      {c.text}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="group/form flex items-end gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 shadow-sm transition duration-200 focus-within:border-[var(--border-hover)] focus-within:ring-2 focus-within:ring-[var(--accent-gold)]/25"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
                title={!sttSupported ? "Χωρίς αναγνώριση φωνής: χρησιμοποιήστε το μικρόφωνο πληκτρολογίου όπου διατίθεται" : undefined}
              >
                <input
                  ref={importFileInputRef}
                  type="file"
                  className="sr-only"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  aria-hidden
                  onChange={onImportSpreadsheetChange}
                />
                {canImportSpreadsheet && (
                  <button
                    type="button"
                    title="Εισαγωγή Excel / CSV"
                    aria-label="Εισαγωγή αρχείου"
                    disabled={loading || streamMode !== "none"}
                    onClick={() => importFileInputRef.current?.click()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:text-[var(--accent-gold)] disabled:opacity-40"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                )}
                <textarea
                  className="min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border-0 bg-transparent px-2 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-0"
                  placeholder="Γράψε εντολή ή ερώτηση..."
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!loading && streamMode === "none" && input.trim()) void send(input);
                    }
                  }}
                  disabled={loading || streamMode !== "none"}
                  inputMode="text"
                  autoComplete="off"
                  enterKeyHint="send"
                />
                <div className="flex shrink-0 items-center gap-0.5 self-end pb-0.5">
                  {sttSupported && (
                    <button
                      type="button"
                      title="Πατήστε για ομιλία"
                      aria-label="Πατήστε για ομιλία"
                      aria-pressed={sttRecording}
                      disabled={loading || streamMode !== "none"}
                      onClick={sttToggle}
                      className={[
                        "flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] transition duration-200",
                        sttRecording
                          ? "text-[var(--danger)]"
                          : "hover:text-[var(--danger)]",
                      ].join(" ")}
                    >
                      <span className="relative flex h-5 w-5 items-center justify-center">
                        {sttRecording && (
                          <span className="absolute -inset-0.5 rounded-full bg-[var(--status-negative-bg)]" aria-hidden />
                        )}
                        <Mic className="relative h-5 w-5" strokeWidth={2.25} />
                      </span>
                    </button>
                  )}
                  {voiceModeConfigured && (
                    <button
                      type="button"
                      title="Φωνητικός διάλογος"
                      aria-label="Φωνητικός διάλογος"
                      disabled={!selectedId || loading || streamMode !== "none"}
                      onClick={() => void startVoice()}
                      className="mr-0.5 flex h-9 w-9 items-center justify-center rounded-full text-[var(--accent-gold)]/90 transition hover:bg-[var(--accent-gold)]/10 disabled:opacity-40"
                    >
                      <Mic className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  )}
                    <button
                    type="submit"
                    disabled={loading || streamMode !== "none" || !input.trim()}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-gold)] text-[var(--text-badge-on-gold)] transition duration-200 hover:opacity-90 disabled:opacity-40"
                    aria-label="Αποστολή"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                {!sttSupported && (
                  <p className="sr-only">
                    Αν δεν εμφανίζεται μικρόφωνο, χρησιμοποιήστε τη φωνητική εισαγωγή πληκτρολογίου (Gboard, iOS, κ.λπ.).
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
      </div>

      <AlexandraVoiceModeOverlay
        open={voiceOpen}
        phase={voicePhase}
        transcript={voiceTranscript}
        error={voiceError}
        muted={voiceMuted}
        onToggleMute={voiceToggleMute}
        onEnd={() => void endVoice()}
        onMinimize={() => {
          void endVoice();
          openMiniFromBubble();
        }}
      />

      {toDelete && (
        <CenteredModal
          open={!!toDelete}
          onClose={() => setToDelete(null)}
          title="Διαγραφή συνομιλίας"
          ariaLabel="Επιβεβαίωση διαγραφής συνομιλίας"
          className="!max-w-sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setToDelete(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition duration-200 hover:bg-[var(--bg-elevated)]"
              >
                Άκυρο
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void deleteConv(toDelete)}
                className="rounded-lg border border-[var(--status-negative-text)]/40 bg-[var(--status-negative-bg)] px-3 py-2 text-sm font-semibold text-[var(--status-negative-text)] transition duration-200 disabled:opacity-50"
              >
                Διαγραφή
              </button>
            </>
          }
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">Διαγραφή αυτής της συνομιλίας;</p>
        </CenteredModal>
      )}
    </div>
  );
}
