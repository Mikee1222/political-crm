"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAlexandraChat } from "@/components/alexandra/alexandra-chat-provider";

/**
 * Quick access: opens the floating mini Αλεξάνδρα (global state).
 * Η πλήρης συζήτηση στη σελίδα /alexandra.
 */
export function AiAssistantWidget() {
  const pathname = usePathname();
  const { openMiniFromBubble, setMiniWindowMinimized } = useAlexandraChat();
  if (pathname === "/alexandra" || pathname.startsWith("/alexandra/")) {
    return null;
  }

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50">
      <button
        type="button"
        onClick={() => {
          openMiniFromBubble();
          setMiniWindowMinimized(false);
        }}
        className="ai-chat-pulse flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-[#0a0f1a] shadow-lg shadow-[var(--accent-gold)]/20 transition hover:brightness-110"
        title="Άνοιγμα Αλεξάνδρα (μίνι παράθυρο)"
        aria-label="Άνοιγμα Αλεξάνδρα (μίνι παράθυρο)"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    </div>
  );
}
