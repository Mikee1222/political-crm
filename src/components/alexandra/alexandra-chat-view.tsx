"use client";

import Link from "next/link";
import { Menu, Mic, Send, Trash2, X } from "lucide-react";
import { useCallback } from "react";
import { useAlexandraVoiceConversation } from "@/hooks/use-alexandra-voice-conversation";
import { AlexandraVoiceModeOverlay } from "./alexandra-voice-mode-overlay";
import ReactMarkdown from "react-markdown";
import { callStatusLabel, callStatusPill } from "@/lib/luxury-styles";
import {
  SUGGESTED,
  greekToolLabel,
  canConfirmCreate,
  canConfirmStartCall,
  canExecuteAction,
  fmtTime,
  initialsName,
  type FindRow,
  type Msg,
  type RowConv,
} from "./alexandra-chat-helpers";
import { useAlexandraSpeechToText } from "@/hooks/use-alexandra-speech-to-text";
import { useAlexandraChat } from "./alexandra-chat-provider";

export function AlexandraChatView({ mode }: { mode: "page" | "mini" }) {
  const {
    role, conversations, selectedId, setSelectedId, messages, loading,
    listLoading, messagesLoading, input, setInput, error, toDelete, setToDelete,
    hoveredId, setHoveredId, sideOpen, setSideOpen, streamMode, bottomRef, newConversation,
    deleteConv, execute, send, startWithChip, confirmStartCall, rejectStartCall, rejectCreate, selectConversation, currentTitle, showChips, enterMiniFromPage,
    loadList, loadMessages,
  } = useAlexandraChat();

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

  const { supported: sttSupported, isRecording: sttRecording, toggle: sttToggle } = useAlexandraSpeechToText(
    input,
    setInput,
    loading || streamMode !== "none",
  );

  return (
    <div
      className={
        mode === "page"
          ? "flex h-[calc(100dvh-6.5rem)] min-h-0 w-full -mx-4 -mb-4 max-md:h-[calc(100dvh-7.5rem)] max-md:min-h-[calc(100dvh-7.5rem)] max-md:mx-0 max-md:mb-0 max-md:shadow-none flex-col overflow-hidden rounded-none border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_4px_32px_rgba(0,0,0,0.45)] sm:-mx-6 sm:-mb-6 md:-mx-8 md:-mb-8 md:rounded-t-xl"
          : "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_4px_32px_rgba(0,0,0,0.45)]"
      }
    >
      {mode === "page" && (
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--border)]/50 bg-[var(--bg-card)]/40 px-3 py-1.5">
          <button
            type="button"
            onClick={enterMiniFromPage}
            className="btn-scale rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--accent-gold)] transition hover:border-[var(--accent-gold)]/50"
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
          mode === "page" ? "flex min-h-0 min-w-0 flex-1 flex-col md:flex-row" : "flex min-h-0 min-w-0 flex-1 flex-col"
        }
      >
        {/* left — 280px — κινητό: συρόμενο πάνελ */}
        {mode === "page" && (
        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-[min(100%,280px)] flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] transition-transform duration-200 md:relative md:inset-auto md:z-0 md:w-[280px] md:translate-x-0",
            sideOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          ].join(" ")}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" aria-hidden />
          <div className="relative z-10 flex shrink-0 items-center justify-between p-4 pb-2 pr-2">
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Αλεξάνδρα</h2>
              <p className="text-xs font-medium text-[var(--accent-gold)]">AI Γραμματέας</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-[var(--text-secondary)] md:hidden"
              onClick={() => setSideOpen(false)}
              aria-label="Κλείσιμο"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative z-10 shrink-0 px-3 pb-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void newConversation()}
              className="w-full rounded-xl border-2 border-[var(--accent-gold)] bg-transparent px-3 py-2.5 text-sm font-semibold text-[var(--accent-gold)] transition duration-200 hover:bg-[var(--accent-gold)] hover:text-[#0a0f1a] disabled:opacity-50"
            >
              + Νέα συνομιλία
            </button>
          </div>
          <div className="relative z-10 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
            {listLoading && <p className="px-2 text-xs text-[var(--text-muted)]">Φόρτωση…</p>}
            {!listLoading && conversations.length === 0 && (
              <p className="px-2 text-center text-xs text-[var(--text-secondary)]">Δεν υπάρχουν συνομιλίες ακόμα</p>
            )}
            {conversations.map((c: RowConv) => {
              const active = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  className="group relative"
                  onMouseEnter={() => setHoveredId(c.id)}
                  onMouseLeave={() => setHoveredId((h: string | null) => (h === c.id ? null : h))}
                >
                  <button
                    type="button"
                    onClick={() => selectConversation(c.id)}
                    className={[
                      "w-full rounded-lg border-l-2 border-transparent px-3 py-2.5 text-left text-sm text-[var(--text-primary)] transition duration-200",
                      active
                        ? "border-[var(--accent-gold)] bg-[var(--bg-elevated)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/80",
                    ].join(" ")}
                  >
                    <p className="line-clamp-2 font-medium">{c.title || "Νέα συνομιλία"}</p>
                    <p className="mt-0.5 text-[10px] text-[#94A3B8]">{fmtTime(c.updated_at)}</p>
                  </button>
                  {(hoveredId === c.id || active) && (
                    <button
                      type="button"
                      title="Διαγραφή"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(c);
                      }}
                      className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-[#94A3B8] hover:bg-white/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
        )}

        {/* right — πλήρες πλάτος chat σε κινητό */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg-primary)]">
          {mode === "mini" && (
            <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-2 py-1.5">
              <label className="sr-only" htmlFor="alexa-mini-conv">Συνομιλία</label>
              <select
                id="alexa-mini-conv"
                className="h-8 min-w-0 flex-1 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text-primary)]"
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
              </select>
              <button
                type="button"
                onClick={() => void newConversation()}
                disabled={loading}
                className="shrink-0 rounded-lg border border-[var(--accent-gold)]/60 px-2 py-1 text-[10px] font-semibold text-[var(--accent-gold)] disabled:opacity-50"
              >
                +Νεα
              </button>
            </div>
          )}
          {selectedId && (
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-3 sm:px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {mode === "page" && (
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-primary)] md:hidden"
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
                className="shrink-0 rounded-lg border border-[var(--accent-gold)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--accent-gold)] transition hover:bg-[var(--accent-gold)] hover:text-[#0a0f1a] disabled:opacity-50"
              >
                Νέα
              </button>
            </header>
          )}
          {mode === "page" && !selectedId && (
            <div className="flex shrink-0 items-center border-b border-[var(--border)] px-3 py-2 md:hidden">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-primary)]"
                onClick={() => setSideOpen(true)}
                aria-label="Μενού συνομιλιών"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedId && (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="hq-pulse-gold flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-3xl font-bold text-[#0a0f1a] shadow-[0_0_40px_rgba(201,168,76,0.25)]">
                  A
                </div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Γεια σου! Είμαι η Αλεξάνδρα</h2>
                <p className="max-w-md text-sm text-[var(--text-secondary)]">Η AI γραμματέας του γραφείου Καραγκούνη</p>
                <div className="mt-2 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTED.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={loading}
                      onClick={() => void startWithChip(c)}
                      className="rounded-2xl border border-[var(--accent-gold)]/50 bg-[var(--bg-elevated)] px-3 py-2.5 text-left text-xs text-[var(--accent-gold)] transition hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 disabled:opacity-50"
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)]">Ή ξεκινήστε με «+ Νέα συνομιλία» αριστερά.</p>
                <button
                  type="button"
                  onClick={() => void newConversation()}
                  disabled={loading}
                  className="mt-2 rounded-full px-6 py-2.5 text-sm font-semibold text-[#0A1628] disabled:opacity-50"
                  style={{ backgroundColor: "#C9A84C" }}
                >
                  + Νέα συνομιλία
                </button>
              </div>
            )}

            {selectedId && messagesLoading && (
              <div className="flex h-40 items-center justify-center p-6 text-sm text-[var(--text-secondary)]">Φόρτωση…</div>
            )}
            {selectedId && !messagesLoading && messages.map((m: Msg & { _createdAt?: string }) => (
              <div key={m.id} className="px-4 py-2">
                <div className={m.role === "user" ? "flex flex-col items-end" : "flex items-start gap-2"}>
                  {m.role === "assistant" && (
                    <span
                      className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ color: "#0A1628", backgroundColor: "#C9A84C" }}
                    >
                      A
                    </span>
                  )}
                  <div
                    className={
                      m.role === "user"
                        ? "w-full min-w-0 max-w-full md:max-w-[min(100%,32rem)]"
                        : "min-w-0 w-full max-w-full flex-1 md:max-w-[min(100%,36rem)]"
                    }
                  >
                    {m.role === "assistant" && m.contextLabel && (
                      <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{m.contextLabel}</span>
                    )}
                    <div
                      className={
                        m.role === "user"
                          ? "rounded-tl-[18px] rounded-tr-[18px] rounded-br-[4px] rounded-bl-[18px] bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] px-4 py-2.5 text-sm font-medium text-[#0a0f1a] shadow-sm"
                          : "rounded-tl-[18px] rounded-tr-[18px] rounded-br-[18px] rounded-bl-[4px] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] shadow-sm"
                      }
                    >
                      {m.role === "user" ? (
                        <p className="whitespace-pre-wrap text-[#0a0f1a]">{m.content}</p>
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
                                className="ai-stream-cursor inline-block h-4 w-0.5 rounded-sm align-middle"
                                style={{ backgroundColor: "#C9A84C" }}
                                aria-hidden
                              />
                            ) : null}
                          </div>
                          {Array.from(
                            new Set(
                              [
                                ...(m.toolsExecutedFromDb ?? []),
                                ...(m.streamMeta?.executed ?? []),
                              ].filter(Boolean),
                            ),
                          ).length > 0 && (
                            <p className="mt-2 text-[10px] font-medium text-[#94A3B8]">
                              <span className="text-[var(--accent-gold)]">✓</span> Εκτελέστηκε
                              {Array.from(
                                new Set([
                                  ...(m.toolsExecutedFromDb ?? []),
                                  ...(m.streamMeta?.executed ?? []),
                                ]),
                              ).length > 0 && (
                                <span className="ml-1.5 text-[9px] font-normal text-[#94A3B8]">
                                  (
                                  {Array.from(
                                    new Set([
                                      ...(m.toolsExecutedFromDb ?? []),
                                      ...(m.streamMeta?.executed ?? []),
                                    ]),
                                  )
                                    .map((t) => greekToolLabel(t))
                                    .join(", ")}
                                  )
                                </span>
                              )}
                            </p>
                          )}
                          {m.findResults && m.findResults.length > 0 && (
                            <ul className="mt-2 space-y-1.5 border-t border-dashed border-[var(--border)] pt-2">
                              {m.findResults.map((c: FindRow) => (
                                <li key={c.id}>
                                  <Link
                                    href={`/contacts/${c.id}`}
                                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-1.5 text-left hover:bg-[var(--bg-elevated)]"
                                  >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003476] text-[10px] font-bold text-white">
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
                            </ul>
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
                                  className="flex-1 rounded-lg bg-[#003476] py-1.5 text-xs font-semibold text-white"
                                >
                                  Ναι
                                </button>
                                <button type="button" onClick={() => rejectStartCall(m.id)} className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs font-medium text-[var(--text-secondary)]">
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
                                <button type="button" disabled={loading} onClick={() => void execute(m.id)} className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-[#0A1628] disabled:opacity-50" style={{ backgroundColor: "#C9A84C" }}>
                                  Εκτέλεση
                                </button>
                                <button type="button" onClick={() => rejectCreate(m.id)} className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs text-[var(--text-secondary)]">
                                  Ακύρωση
                                </button>
                              </div>
                            </div>
                          )}
                          {m.pendingAction && !m.executed && canExecuteAction(role, m.pendingAction) && m.pendingAction.action === "update_status" && (
                            <div className="mt-2 border-t border-dashed border-[var(--border)] pt-2">
                              <pre className="mb-1 max-h-20 overflow-auto rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-secondary)]">{JSON.stringify(m.pendingAction, null, 0)}</pre>
                              <button type="button" disabled={loading} onClick={() => void execute(m.id)} className="w-full rounded-lg py-1.5 text-xs font-semibold text-[#0A1628] disabled:opacity-50" style={{ backgroundColor: "#C9A84C" }}>
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
                                <button type="button" disabled={loading} onClick={() => void execute(m.id)} className="w-full rounded-lg py-1.5 text-xs font-semibold text-[#0A1628] disabled:opacity-50" style={{ backgroundColor: "#C9A84C" }}>
                                  Εκτέλεση
                                </button>
                              </div>
                            )}
                          {m.pendingAction && !m.executed && !canExecuteAction(role, m.pendingAction) && m.pendingAction.action !== "start_call" && m.pendingAction.action !== "create_contact" && (
                            <p className="mt-2 text-xs text-amber-200/95">Δεν έχετε δικαίωμα· ρωτήστε υπεύθυνο.</p>
                          )}
                        </>
                      )}
                    </div>
                    <p
                      className={
                        m.role === "user" ? "mt-1 text-right text-[10px] text-[#94A3B8]" : "mt-1 text-[10px] text-[#94A3B8]"
                      }
                    >
                      {m._createdAt ? fmtTime(m._createdAt) : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {selectedId && streamMode === "typing" && (
              <div className="flex justify-start gap-2 px-4 py-2">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ color: "#0A1628", backgroundColor: "#C9A84C" }}>A</span>
                <div className="flex items-center gap-0.5 self-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                  <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:0ms]" />
                  <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:150ms]" />
                  <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {error && <p className="px-4 text-center text-xs text-red-600">{error}</p>}
            <div ref={bottomRef} />
          </div>

          {selectedId && (
            <div
              className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)] p-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              {showChips && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {SUGGESTED.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void send(c)}
                      className="rounded-full border border-[var(--accent-gold)]/40 bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--accent-gold)] transition hover:bg-[var(--accent-gold)]/15"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex flex-col gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-2 pl-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
                title={!sttSupported ? "Χωρίς αναγνώριση φωνής: χρησιμοποιήστε το μικρόφωνο πληκτρολογίου όπου διατίθεται" : undefined}
              >
                <div className="flex items-end gap-2">
                  <textarea
                    className="min-h-[48px] min-w-0 flex-1 resize-y rounded-2xl border-0 bg-transparent px-1 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0"
                    placeholder="Γράψτε εδώ…"
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
                  {sttSupported && (
                    <button
                      type="button"
                      title="Πατήστε για ομιλία"
                      aria-label="Πατήστε για ομιλία"
                      aria-pressed={sttRecording}
                      disabled={loading || streamMode !== "none"}
                      onClick={sttToggle}
                      className={[
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition",
                        sttRecording
                          ? "alex-stt-recording border-red-500/50 text-red-200"
                          : "hover:border-red-500/30 hover:text-red-300/90",
                      ].join(" ")}
                    >
                      <span className="relative flex h-5 w-5 items-center justify-center">
                        {sttRecording && (
                          <span className="absolute -inset-0.5 rounded-full bg-red-500/20" aria-hidden />
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
                      className="flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center self-end rounded-full border-2 border-[var(--accent-gold)]/90 bg-[var(--bg-elevated)]/80 text-[var(--accent-gold)] transition hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 disabled:opacity-40"
                    >
                      <Mic className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading || streamMode !== "none" || !input.trim()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-2xl bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-[#0a0f1a] shadow-md transition hover:shadow-[0_0_20px_rgba(201,168,76,0.35)] disabled:opacity-40"
                    aria-label="Αποστολή"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                {!sttSupported && (
                  <p className="px-0.5 text-[10px] text-[var(--text-muted)]">
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
      />

      {toDelete && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[8px] [background:var(--overlay-scrim)]"
          role="dialog"
          aria-modal
        >
          <div className="hq-modal-panel max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xl">
            <p className="text-sm font-medium text-[var(--text-primary)]">Διαγραφή αυτής της συνομιλίας;</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setToDelete(null)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Άκυρο
              </button>
              <button type="button" disabled={loading} onClick={() => void deleteConv(toDelete)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
