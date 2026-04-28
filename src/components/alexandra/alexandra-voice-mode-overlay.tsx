"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Minimize2, Volume2, VolumeX, X } from "lucide-react";
import type { VoiceTranscriptLine, VoiceUiPhase } from "@/hooks/use-alexandra-voice-conversation";

function phaseLabel(phase: VoiceUiPhase): string {
  switch (phase) {
    case "CONNECTING":
      return "Σύνδεση…";
    case "LISTENING":
      return "Ακούω…";
    case "THINKING":
      return "Σκέφτεται…";
    case "SPEAKING":
      return "Η Αλεξάνδρα μιλάει…";
    case "IDLE":
    default:
      return "Έτοιμη";
  }
}

function SoundWaves({ variant }: { variant: "blue" | "gold" }) {
  const a = variant === "blue" ? "alex-voice-wave--blue" : "alex-voice-wave--gold";
  return (
    <div
      className="flex h-8 items-end justify-center gap-0.5"
      role="img"
      aria-label={variant === "blue" ? "Ένταση μικροφώνου" : "Ένταση ομιλίας"}
    >
      {Array.from({ length: 7 }, (_, i) => (
        <span
          key={i}
          className={["alex-voice-bar w-1 rounded-full", a].join(" ")}
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function AlexandraVoiceModeOverlay({
  open,
  phase,
  transcript,
  error,
  muted,
  onToggleMute,
  onEnd,
  onMinimize,
}: {
  open: boolean;
  phase: VoiceUiPhase;
  transcript: VoiceTranscriptLine[];
  error: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  /** Κλείνει φωνή· ανοίγει mini παράθυρο όταν δοθεί */
  onMinimize?: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEnd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onEnd]);

  if (!mounted || !open) return null;

  const isConnecting = phase === "CONNECTING";
  const ringClass =
    phase === "SPEAKING"
      ? "alex-voice-ring alex-voice-ring--gold-pulse"
      : phase === "THINKING"
        ? "alex-voice-ring alex-voice-ring--think-spin"
        : phase === "LISTENING"
          ? "alex-voice-ring alex-voice-ring--blue-pulse"
          : "alex-voice-ring alex-voice-ring--gold-inner";

  const showWaves = phase === "LISTENING" || phase === "SPEAKING";

  const node = (
    <div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-between overflow-hidden bg-black/50 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] backdrop-blur-md"
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onEnd();
      }}
    >
      <p id={titleId} className="sr-only">
        Φωνητική συνομιλία με την Αλεξάνδρα
      </p>
      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 sm:right-5 sm:top-5">
        <button
          type="button"
          onClick={onEnd}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[#0a1628]/90 text-[var(--text-secondary)] shadow-lg transition hover:border-[#C9A84C]/50 hover:text-[#C9A84C]"
          aria-label="Κλείσιμο"
        >
          <X className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>

      {isConnecting && (
        <p className="max-w-md text-center text-[10px] leading-tight text-[#94A3B8]" aria-hidden>
          Σε κινητό, η παράδοση του ήχη στο αυτί εξαρτάται από τη συσκευή (κοντινός αισθήτρας / Safari).
        </p>
      )}

      <div className="flex min-h-0 w-full max-w-lg flex-1 flex-col items-center justify-center">
        {isConnecting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2
              className="h-10 w-10 shrink-0 animate-spin text-[var(--accent-gold)]"
              aria-hidden
            />
            <p className="text-lg font-medium text-[var(--text-primary)]">Σύνδεση…</p>
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col items-center px-1">
            <div
              className={[
                "mb-2 flex h-32 w-32 items-center justify-center rounded-full sm:h-40 sm:w-40",
                ringClass,
              ].join(" ")}
              aria-hidden
            >
              <div className="h-2 w-2 rounded-full bg-[var(--accent-gold)]/30" />
            </div>
            {error && <p className="mb-2 max-w-sm text-center text-sm text-amber-400/90">{error}</p>}
            <p
              className="mb-3 min-h-8 text-center text-lg font-semibold text-[var(--text-primary)]"
              aria-live="polite"
            >
              {phaseLabel(phase)}
            </p>
            {showWaves && phase === "LISTENING" && <SoundWaves variant="blue" />}
            {showWaves && phase === "SPEAKING" && <SoundWaves variant="gold" />}
            {phase === "THINKING" && <div className="h-8" aria-hidden />}

            <div className="mt-5 w-full min-h-0 max-h-[min(32vh,320px)] flex-1 overflow-y-auto rounded-2xl border border-[var(--border)]/60 bg-[#0a1628]/60 px-3 py-2.5 text-left">
              {transcript.length === 0 ? (
                <p className="text-center text-sm text-[var(--text-muted)]">Ζωντανό κείμενο…</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {transcript.map((l) => (
                    <li key={l.id} className="break-words">
                      <span className="font-semibold text-[var(--accent-gold)]">
                        {l.role === "user" ? "Εσείς" : "Αλεξάνδρα"}:{" "}
                      </span>
                      <span className="text-[var(--text-primary)]/95">{l.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {!isConnecting && (
        <div className="relative z-10 flex w-full max-w-md min-h-[4.5rem] items-end justify-between gap-2 px-1 sm:px-0">
          <div className="w-1/3 flex justify-start">
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-12 w-12 min-h-[48px] min-w-[48px] touch-manipulation items-center justify-center rounded-full border-2 border-[var(--border)] bg-[#0a1628] text-[var(--text-secondary)] transition hover:border-[var(--accent-gold)]/30 hover:text-[var(--text-primary)]"
              title={muted ? "Άρση σίγασης" : "Σίγαση"}
              aria-pressed={muted}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>
          <div className="flex w-1/3 justify-center">
            <button
              type="button"
              onClick={onEnd}
              className="flex h-16 w-16 min-h-[64px] min-w-[64px] touch-manipulation items-center justify-center rounded-full border-2 border-red-500/50 bg-red-600/20 text-red-200 shadow-lg shadow-red-900/50 transition active:scale-95 hover:bg-red-600/35"
              title="Λήξη"
              aria-label="Λήξη κλήσης"
            >
              <X className="h-8 w-8 stroke-[2.5]" />
            </button>
          </div>
          <div className="w-1/3 flex justify-end">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border border-[var(--border)] bg-[#0a1628] text-[var(--text-secondary)] transition hover:text-[var(--accent-gold)]"
                title="Ελαχιστοποίηση (mini)"
                aria-label="Ελαχιστοποίηση"
              >
                <Minimize2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(node, document.body);
}
