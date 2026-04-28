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
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] max-lg:right-4">
      <div className="relative">
        <div
          className="hq-alexandra-glow-ring pointer-events-none absolute -inset-1 rounded-2xl bg-[radial-gradient(circle,rgba(201,168,76,0.35)_0%,transparent_72%)] opacity-90"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => {
            openMiniFromBubble();
            setMiniWindowMinimized(false);
          }}
          className="hq-alexandra-launch-btn relative flex items-center gap-2.5 rounded-2xl px-[18px] py-3 text-white shadow-[0_8px_32px_rgba(201,168,76,0.4),0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:shadow-[0_12px_40px_rgba(201,168,76,0.5)] active:scale-[0.97] md:py-3"
          title="Άνοιγμα Αλεξάνδρα (μίνι παράθυρο)"
          aria-label="Άνοιγμα Αλεξάνδρα (μίνι παράθυρο)"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-white" strokeWidth={2.2} />
          <span className="text-xs font-semibold tracking-wide text-white sm:text-sm">Αλεξάνδρα</span>
          <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-bold text-white/90">AI</span>
        </button>
      </div>
    </div>
  );
}
