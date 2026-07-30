"use client";

import { ChevronDown, ChevronUp, MessageSquare, Sparkles, User } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AGENT_DISPLAY_NAME,
  parseCallTranscript,
  transcriptParticipantLabel,
  type CallTranscriptTurn,
} from "@/lib/call-transcript";

type CallTranscriptBlockProps = {
  raw: string;
  /** Contact full name for `user:` turns (Greek display name). */
  contactName?: string | null;
  /** Align toggle to the right (campaign table cell). */
  align?: "left" | "right";
};

function TurnBubble({
  turn,
  contactName,
}: {
  turn: CallTranscriptTurn;
  contactName?: string | null;
}) {
  const isAgent = turn.role === "agent";
  const isUser = turn.role === "user";
  const label = transcriptParticipantLabel(turn.role, contactName);

  if (!isAgent && !isUser) {
    return (
      <div className="mx-auto max-w-[90%] rounded-2xl bg-[var(--bg-elevated)] px-4 py-2 text-center text-xs leading-relaxed text-[var(--text-secondary)]">
        {turn.text}
      </div>
    );
  }

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[80%] rounded-2xl px-4 py-2",
          isAgent
            ? "border-l-[3px] border-l-[#D4AF37] bg-[#FDF8EC]"
            : "bg-[#F5F5F5]",
        ].join(" ")}
      >
        <div
          className={[
            "mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide",
            isAgent ? "text-[#D4AF37]" : "text-[var(--accent-blue)]",
          ].join(" ")}
        >
          {isAgent ? (
            <Sparkles className="h-3 w-3 shrink-0 text-[#D4AF37]" aria-hidden />
          ) : (
            <User className="h-3 w-3 shrink-0 text-gray-400" aria-hidden />
          )}
          <span>{label || (isAgent ? AGENT_DISPLAY_NAME : "Επαφή")}</span>
        </div>
        <p
          className={[
            "text-xs leading-relaxed",
            isAgent ? "text-[var(--text-primary)]" : "text-[var(--accent-blue)]",
          ].join(" ")}
        >
          {turn.text}
        </p>
      </div>
    </div>
  );
}

export function CallTranscriptBlock({
  raw,
  contactName,
  align = "left",
}: CallTranscriptBlockProps) {
  const [open, setOpen] = useState(false);
  const turns = useMemo(() => parseCallTranscript(raw), [raw]);
  if (!turns.length) return null;

  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <span>Συνομιλία</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      {open && (
        <div
          className={[
            "mt-2 space-y-2 rounded-xl border border-[var(--border)]/60 bg-[var(--bg-card)] px-3 py-3",
            align === "right" ? "text-left" : "",
          ].join(" ")}
        >
          <div className="mb-2 flex items-center gap-1.5 border-b border-[var(--border)]/50 pb-2 text-xs font-semibold text-[var(--text-primary)]">
            <MessageSquare className="h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden />
            Συνομιλία
          </div>
          {turns.map((t, i) => (
            <TurnBubble key={`${t.role}-${i}`} turn={t} contactName={contactName} />
          ))}
        </div>
      )}
    </div>
  );
}
