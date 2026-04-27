"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { Conversation, type Mode, type Status } from "@11labs/client";
import { PORTAL_SYSTEM_PROMPT } from "@/lib/portal-alexandra-prompt";

export type PortalVoiceUiPhase = "IDLE" | "CONNECTING" | "SPEAKING" | "THINKING" | "LISTENING";

export type Line = { id: string; role: "user" | "assistant"; text: string };

function mapSource(source: "user" | "ai"): "user" | "assistant" {
  return source === "user" ? "user" : "assistant";
}

function phaseFrom(
  s: Status | "idle" | "disconnecting",
  m: Mode | null,
  awaitAgent: boolean,
): PortalVoiceUiPhase {
  if (s === "idle" || s === "disconnected" || s === "disconnecting") return "IDLE";
  if (s === "connecting") return "CONNECTING";
  if (s !== "connected") return "CONNECTING";
  const m2: Mode = m ?? "listening";
  if (m2 === "speaking") return "SPEAKING";
  if (m2 === "listening" && awaitAgent) return "THINKING";
  return "LISTENING";
}

type Conv = Awaited<ReturnType<typeof Conversation.startSession>>;

/**
 * Public portal voice: same ElevenLabs agent, portal system prompt via overrides (no CRM persistence).
 */
export function usePortalVoiceConversation() {
  const [open, setOpen] = useState(false);
  const [uiPhase, setUiPhase] = useState<PortalVoiceUiPhase>("IDLE");
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const convRef = useRef<Conv | null>(null);
  const awaitingAgentRef = useRef(false);
  const modeRef = useRef<Mode | null>(null);
  const statusRef = useRef<Status | "idle" | "disconnecting">("idle");

  const refreshPhase = useCallback(() => {
    setUiPhase(phaseFrom(statusRef.current, modeRef.current, awaitingAgentRef.current));
  }, []);

  useEffect(() => {
    return () => {
      if (convRef.current) {
        void convRef.current.endSession();
      }
    };
  }, []);

  const endVoice = useCallback(async () => {
    const c = convRef.current;
    if (c) {
      try {
        await c.endSession();
      } catch {
        // ignore
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
    resetSessionState();
    setOpen(true);
    statusRef.current = "connecting";
    modeRef.current = "listening";
    refreshPhase();
    setError(null);

    try {
      const res = await fetchWithTimeout("/api/portal/voice/session", { method: "POST" });
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
          agent: {
            language: "el",
            prompt: { prompt: PORTAL_SYSTEM_PROMPT },
          },
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
          setTranscript((prev) => [
            ...prev,
            {
              id: typeof crypto !== "undefined" && crypto.randomUUID
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
        onDisconnect: () => {
          convRef.current = null;
          statusRef.current = "disconnected";
          setOpen(false);
          setUiPhase("IDLE");
          awaitingAgentRef.current = false;
          modeRef.current = null;
          setMuted(false);
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
  }, [refreshPhase, resetSessionState]);

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
