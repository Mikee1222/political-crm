"use client";

import { Download, Share2, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type InstallPlatform = "android-chrome" | "ios-safari" | "other";

export function detectInstallPlatform(): InstallPlatform {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "other";
  }
  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = ua.includes("android");
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isChrome = ua.includes("chrome") && !ua.includes("edg");
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("fxios");
  if (isAndroid && isChrome) return "android-chrome";
  if (isIOS && isSafari) return "ios-safari";
  return "other";
}

export function useInstallPlatform() {
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  useEffect(() => {
    setPlatform(detectInstallPlatform());
  }, []);
  return platform;
}

export function installStepsForPlatform(platform: InstallPlatform): string[] {
  if (platform === "android-chrome") {
    return [
      "Πατήστε το μενού ⋮ πάνω δεξιά",
      "Επιλέξτε Προσθήκη στην αρχική οθόνη",
      "Πατήστε Εγκατάσταση",
    ];
  }
  if (platform === "ios-safari") {
    return [
      "Πατήστε το κουμπί κοινής χρήσης □↑",
      "Επιλέξτε Προσθήκη στην αρχική οθόνη",
      "Πατήστε Προσθήκη",
    ];
  }
  return [
    "Ανοίξτε την εφαρμογή σε Chrome (Android) ή Safari (iPhone)",
    "Αναζητήστε την επιλογή Προσθήκη στην αρχική οθόνη",
    "Επιβεβαιώστε για εγκατάσταση",
  ];
}

export function PwaInstallSteps({
  title,
  subtitle,
  compact = false,
  className = "",
}: {
  title: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
}) {
  const platform = useInstallPlatform();
  const steps = useMemo(() => installStepsForPlatform(platform), [platform]);
  const Icon = platform === "ios-safari" ? Share2 : platform === "android-chrome" ? Download : Smartphone;

  return (
    <section
      className={[
        "rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--card-shadow)]",
        compact ? "p-3" : "p-4 sm:p-5",
        className,
      ].join(" ")}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-gold)_16%,var(--bg-elevated))] text-[var(--accent-gold)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className={compact ? "text-sm font-bold text-[var(--text-primary)]" : "text-base font-bold text-[var(--text-primary)]"}>{title}</h3>
          {subtitle ? <p className="text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
      </div>
      <ol className={compact ? "space-y-2.5" : "space-y-3"}>
        {steps.map((step, idx) => (
          <li key={step} className="flex items-start gap-2.5">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-gold)_18%,var(--bg-card))] text-xs font-bold text-[var(--accent-gold)] [animation:hq-pulse-dot_2.2s_ease-in-out_infinite]" aria-hidden>
              {idx + 1}
            </span>
            <span className={compact ? "text-xs text-[var(--text-secondary)]" : "text-sm text-[var(--text-secondary)]"}>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
