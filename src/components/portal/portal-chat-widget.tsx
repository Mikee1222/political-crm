"use client";

import { Send, X, Mic, MicOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { PORTAL_SUGGESTED_CHIPS } from "@/lib/portal-alexandra-prompt";
import { usePortalVoiceConversation } from "@/hooks/use-portal-voice-conversation";

const ND = "#003476";
const STORAGE_KEY = "portal-alexandra-chat";
const MAX_MSG = 10;

type Msg = { id: string; role: "user" | "assistant"; content: string };

function loadFromStorage(): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as { messages?: Msg[] };
    const a = j.messages;
    if (!Array.isArray(a)) return [];
    return a
      .filter(
        (m) =>
          m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
      .map((m) => ({
        id: m.id || `m-${Math.random()}`,
        role: m.role,
        content: m.content.slice(0, 20_000),
      }))
      .slice(-MAX_MSG);
  } catch {
    return [];
  }
}

function saveToStorage(messages: Msg[]) {
  try {
    const trimmed = messages.slice(-MAX_MSG);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: trimmed }));
  } catch {
    // ignore
  }
}

const voiceOk =
  typeof process !== "undefined" &&
  Boolean(process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID?.length);

function phaseLabel(p: string) {
  if (p === "CONNECTING") return "Σύνδεση…";
  if (p === "THINKING") return "Σκέφτομαι…";
  if (p === "SPEAKING") return "Μιλάω…";
  if (p === "LISTENING") return "Σε ακούω…";
  if (p === "IDLE") return "";
  return p;
}

export function PortalChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { open: voiceOpen, uiPhase, transcript, error: voiceErr, muted, startVoice, endVoice, toggleMute } =
    usePortalVoiceConversation();

  useEffect(() => {
    setMessages(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(messages);
  }, [messages, hydrated]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, transcript]);

  const sendText = useCallback(
    async (raw: string) => {
      const text = String(raw).trim();
      if (!text || loading) return;
      setErr(null);
      setLoading(true);
      const userId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `u-${Date.now()}`;
      const userMsg: Msg = { id: userId, role: "user", content: text };
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((p) => [...p, userMsg].slice(-MAX_MSG));
      try {
        const res = await fetchWithTimeout("/api/portal/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationHistory: history,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
        if (res.status === 429) {
          setErr(j.error ?? "Έχετε στείλει πολλά μηνύματα. Δοκιμάστε ξανά σε λίγο.");
          setMessages((p) => p.filter((m) => m.id !== userId));
          return;
        }
        if (!res.ok) {
          setErr(j.error ?? "Σφάλμα");
          setMessages((p) => p.filter((m) => m.id !== userId));
          return;
        }
        const reply = String(j.reply ?? "").trim();
        if (!reply) {
          setErr("Άδεια απάντηση");
          setMessages((p) => p.filter((m) => m.id !== userId));
          return;
        }
        const asId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `a-${Date.now()}`;
        const asMsg: Msg = { id: asId, role: "assistant", content: reply };
        setMessages((p) => [...p, asMsg].slice(-MAX_MSG));
      } catch {
        setErr("Σφάλμα δικτύου");
        setMessages((p) => p.filter((m) => m.id !== userId));
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  const onChip = (c: string) => {
    void sendText(c);
  };

  if (!hydrated) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50">
      {!open && (
        <div className="pointer-events-auto">
          <button
            type="button"
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg font-bold text-white shadow-lg transition hover:opacity-95"
            style={{ background: ND, boxShadow: "0 8px 24px rgba(0,52,118,0.35)" }}
            onClick={() => {
              setOpen(true);
              setErr(null);
            }}
            title="Μιλήστε με την Αλεξάνδρα"
            aria-label="Μιλήστε με την Αλεξάνδρα"
          >
            A
          </button>
        </div>
      )}

      {open && (
        <div
          className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{ width: 360, maxWidth: "calc(100vw - 2rem)", height: 500, maxHeight: "min(500px, 70vh)" }}
          role="dialog"
          aria-label="Αλεξάνδρα — βοηθός portal"
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 pr-2">
            <div className="min-w-0">
              <h2 className="text-sm font-bold" style={{ color: ND }}>Αλεξάνδρα</h2>
              <p className="text-[10px] text-slate-500">Βοηθός γραφείου Καραγκούνη</p>
            </div>
            <div className="flex items-center gap-0.5">
              {voiceOk && (
                <button
                  type="button"
                  onClick={() => (voiceOpen ? void endVoice() : void startVoice())}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-200"
                  title={voiceOpen ? "Τέλος φωνής" : "Φωνή — συνομιλία"}
                  aria-label="Φωνητική λειτουργία"
                >
                  {voiceOpen ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" style={{ color: ND }} />}
                </button>
              )}
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200"
                onClick={() => {
                  setOpen(false);
                  if (voiceOpen) void endVoice();
                }}
                aria-label="Κλείσιμο"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {voiceOpen && (
            <div className="shrink-0 space-y-1.5 border-b border-slate-200 bg-amber-50/80 px-3 py-2">
              <div className="flex items-center justify-between text-[10px] text-slate-600">
                <span>{phaseLabel(uiPhase) || "Φωνητική λειτουργία"}</span>
                {voiceOpen && (
                  <button
                    type="button"
                    className="text-[10px] font-semibold"
                    onClick={() => void toggleMute()}
                    style={{ color: ND }}
                  >
                    {muted ? "Ήχος: απεν." : "Ήχος: on"}
                  </button>
                )}
              </div>
              {voiceErr && <p className="text-[10px] text-red-600">{voiceErr}</p>}
              {transcript.length > 0 && (
                <div className="max-h-20 overflow-y-auto text-[10px] text-slate-700">
                  {transcript.slice(-4).map((l) => (
                    <p key={l.id} className="truncate">
                      <span className="font-semibold">{l.role === "user" ? "Εσείς: " : "Αλεξάνδρα: "}</span>
                      {l.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
          ref={listRef}
          className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]"
        >
            {messages.length === 0 && !voiceOpen && (
              <div>
                <p className="mb-2 text-xs text-slate-500">Διάλεξτε:</p>
                <div className="flex flex-wrap gap-1.5">
                  {PORTAL_SUGGESTED_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-[11px] font-medium text-slate-700 transition hover:border-blue-200 hover:bg-slate-100"
                      onClick={() => onChip(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex w-full min-w-0 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: "#e8f0f9", color: "#0f172a" }
                      : { background: "#f1f5f9", color: "#0f172a", border: "1px solid #e2e8f0" }
                  }
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-slate-800 prose-p:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <p className="text-xs text-slate-400" aria-live="polite">
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Περιμένετε…
              </p>
            )}
            {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white p-2">
            <div className="flex gap-1.5">
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const t = input.trim();
                    if (t) {
                      setInput("");
                      void sendText(t);
                    }
                  }
                }}
                placeholder="Μήνυμα…"
                maxLength={8000}
                disabled={loading}
                aria-label="Μήνυμα"
              />
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-50"
                style={{ background: ND }}
                disabled={loading || !input.trim()}
                onClick={() => {
                  const t = input.trim();
                  if (t) {
                    setInput("");
                    void sendText(t);
                  }
                }}
                aria-label="Αποστολή"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
