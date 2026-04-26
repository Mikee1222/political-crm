"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { Conversation, type Mode, type Status } from "@11labs/client";

/**
 * ElevenLabs voice agent — dashboard setup (before using voice mode):
 * 1. Go to https://elevenlabs.io → Conversational AI → Create Agent
 * 2. Set voice to ID: 1gkXJMvrzBWAwt0XqBaa
 * 3. Set language to Greek
 * 4. Set system prompt (copy into the agent in ElevenLabs; keep short replies):
 *
 *    Είσαι η Αλεξάνδρα, η AI γραμματέας του βουλευτή Κώστα Καραγκούνη.
 *    Μιλάς Ελληνικά, είσαι επαγγελματική και σύντομη.
 *    Βοηθάς με ερωτήσεις για το πολιτικό γραφείο.
 *    Κρατάς τις απαντήσεις σύντομες — 1-2 προτάσεις.
 *
 * 5. Copy Agent ID to NEXT_PUBLIC_ELEVENLABS_AGENT_ID, set ELEVENLABS_API_KEY (server);
 *    enable signed-URL auth in the agent if the dashboard requires it.
 */
export type VoiceUiPhase = "IDLE" | "CONNECTING" | "LISTENING" | "THINKING" | "SPEAKING";

export type VoiceTranscriptLine = { id: string; role: "user" | "assistant"; text: string };

type RawMsg = { role: "user" | "assistant"; content: string };

function mergeConsecutive(raw: RawMsg[]): RawMsg[] {
  const out: RawMsg[] = [];
  for (const e of raw) {
    const c = e.content.replace(/\s+/g, " ").trim();
    if (!c) continue;
    const last = out[out.length - 1];
    if (last && last.role === e.role) {
      last.content = `${last.content} ${c}`.trim();
    } else {
      out.push({ role: e.role, content: c });
    }
  }
  return out;
}

function mapSource(source: "user" | "ai"): "user" | "assistant" {
  return source === "user" ? "user" : "assistant";
}

function phaseFrom(
  s: Status | "idle" | "disconnecting",
  m: Mode | null,
  awaitAgent: boolean,
): VoiceUiPhase {
  if (s === "idle" || s === "disconnected" || s === "disconnecting") return "IDLE";
  if (s === "connecting") return "CONNECTING";
  if (s !== "connected") return "CONNECTING";
  const m2: Mode = m ?? "listening";
  if (m2 === "speaking") return "SPEAKING";
  if (m2 === "listening" && awaitAgent) return "THINKING";
  return "LISTENING";
}

type Conv = Awaited<ReturnType<typeof Conversation.startSession>>;

export function useAlexandraVoiceConversation(
  conversationId: string | null,
  { onAfterPersist }: { onAfterPersist: () => void | Promise<void> },
) {
  const [open, setOpen] = useState(false);
  const [uiPhase, setUiPhase] = useState<VoiceUiPhase>("IDLE");
  const [transcript, setTranscript] = useState<VoiceTranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const rawMessagesRef = useRef<RawMsg[]>([]);
  const convRef = useRef<Conv | null>(null);
  const persistedRef = useRef(false);
  const awaitingAgentRef = useRef(false);
  const modeRef = useRef<Mode | null>(null);
  const statusRef = useRef<Status | "idle" | "disconnecting">("idle");
  const onAfterPersistRef = useRef(onAfterPersist);
  onAfterPersistRef.current = onAfterPersist;

  useEffect(() => {
    return () => {
      if (convRef.current) {
        void convRef.current.endSession();
      }
    };
  }, []);

  const refreshPhase = useCallback(() => {
    setUiPhase(phaseFrom(statusRef.current, modeRef.current, awaitingAgentRef.current));
  }, []);

  const persistAndClose = useCallback(async () => {
    if (persistedRef.current) return;
    persistedRef.current = true;
    const merged = mergeConsecutive(rawMessagesRef.current);
    rawMessagesRef.current = [];
    if (merged.length > 0 && conversationId) {
      try {
        const res = await fetchWithTimeout(`/api/ai-conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: merged }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error || "Η αποθήκευση απέτυχε");
        }
      } catch {
        setError("Σφάλμα δικτύου κατά την αποθήκευση");
      }
    }
    try {
      await onAfterPersistRef.current();
    } catch {
      /* empty */
    }
  }, [conversationId]);

  const endVoice = useCallback(async () => {
    const c = convRef.current;
    if (c) {
      try {
        await c.endSession();
      } catch {
        /* */
      }
    } else {
      setOpen(false);
    }
  }, []);

  const resetSessionState = useCallback(() => {
    setTranscript([]);
    setError(null);
    awaitingAgentRef.current = false;
    modeRef.current = null;
    setMuted(false);
    rawMessagesRef.current = [];
    persistedRef.current = false;
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      const vol = next ? 0 : 1;
      convRef.current?.setVolume({ volume: vol });
      return next;
    });
  }, []);

  const startVoice = useCallback(async () => {
    if (!conversationId) {
      setError("Επιλέξτε συνομιλία πρώτα");
      return;
    }
    resetSessionState();
    setOpen(true);
    statusRef.current = "connecting";
    modeRef.current = "listening";
    refreshPhase();
    setError(null);

    try {
      const res = await fetchWithTimeout("/api/voice/session", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { signed_url?: string; error?: string };
      if (!res.ok) {
        throw new Error(j.error || "Άρνηση σύνδεσης");
      }
      if (!j.signed_url) {
        throw new Error("Χωρίς URL συνεδρίας");
      }

      const conv = await Conversation.startSession({
        signedUrl: j.signed_url,
        useWakeLock: true,
        preferHeadphonesForIosDevices: true,
        connectionType: "websocket",
        overrides: {
          agent: { language: "el" },
        },
        onConnect: () => {
          statusRef.current = "connected";
          setUiPhase(phaseFrom("connected", modeRef.current, awaitingAgentRef.current));
        },
        onDebug: () => {},
        onError: (msg) => {
          setError(String(msg).slice(0, 240));
        },
        onMessage: (props) => {
          const { message, source } = props;
          const role = mapSource(source);
          if (source === "user") {
            awaitingAgentRef.current = true;
          } else {
            awaitingAgentRef.current = false;
          }
          rawMessagesRef.current.push({ role, content: message });
          setTranscript((prev) => [
            ...prev,
            {
              id:
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
              role,
              text: message,
            },
          ]);
          refreshPhase();
        },
        onModeChange: ({ mode: m }) => {
          modeRef.current = m;
          if (m === "speaking") {
            awaitingAgentRef.current = false;
          }
          setUiPhase(phaseFrom(statusRef.current, m, awaitingAgentRef.current));
        },
        onStatusChange: ({ status: st }) => {
          statusRef.current = st;
          if (st === "connected") {
            setUiPhase(phaseFrom(st, modeRef.current, awaitingAgentRef.current));
            return;
          }
          if (st === "disconnected" || st === "disconnecting") {
            return;
          }
          setUiPhase(phaseFrom(st, modeRef.current, awaitingAgentRef.current));
        },
        onCanSendFeedbackChange: () => {},
        onDisconnect: async () => {
          convRef.current = null;
          statusRef.current = "disconnected";
          setOpen(false);
          setUiPhase("IDLE");
          awaitingAgentRef.current = false;
          modeRef.current = null;
          setMuted(false);
          await persistAndClose();
        },
        onAudio: () => {},
      });
      convRef.current = conv;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Σφάλμα σύνδεσης");
      setOpen(false);
      setUiPhase("IDLE");
      statusRef.current = "idle";
    }
  }, [conversationId, persistAndClose, refreshPhase, resetSessionState]);

  return {
    open,
    uiPhase,
    transcript,
    error,
    muted,
    startVoice,
    endVoice,
    toggleMute,
  };
}
