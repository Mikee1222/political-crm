"use client";

import { MapPin, Navigation } from "lucide-react";

/** Google Maps — static links (no embed API / iframes; avoids third-party cookie blocks). */
const OFFICES = {
  agrinio: {
    label: "Πολιτικό Γραφείο — Αγρίνιο",
    address: "Χαριλάου Τρικούπη 7, 301 00 Αγρίνιο",
    phone: "26410-46603",
    phoneHref: "tel:+302641046603",
    fax: "26410-46605",
    mapsSearchUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Χαριλάου Τρικούπη 7 Αγρίνιο")}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Χαριλάου Τρικούπη 7, Αγρίνιο")}`,
  },
  athens: {
    label: "Πολιτικό Γραφείο — Αθήνα",
    address: "Σέκερη 1, 106 71 Αθήνα",
    phone: "210-8820388",
    phoneHref: "tel:+302108820388",
    fax: "210-3675646",
    mapsSearchUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Σέκερη 1 Αθήνα")}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Σέκερη 1, Αθήνα 106 71")}`,
  },
} as const;

type OfficeMapsSectionProps = {
  variant: "light" | "dark";
  heading?: string;
};

function OfficeMapCard({ office, variant }: { office: (typeof OFFICES)[keyof typeof OFFICES]; variant: "light" | "dark" }) {
  const isDark = variant === "dark";
  const textMuted = isDark ? "text-slate-400" : "text-slate-600";
  const textMain = isDark ? "text-slate-200" : "text-[#1A1A2E]";
  const titleClass = isDark ? "text-white" : "text-[#0f172a]";
  const cardBg = isDark ? "border-slate-700/80 bg-[#0f141c]" : "border-[#E2E8F0] bg-white";
  const mapAccent = isDark ? "text-[#C9A84C]/90" : "text-[#003476]/80";

  return (
    <div className={["overflow-hidden rounded-2xl border shadow-sm", cardBg].join(" ")}>
      <div className="p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: isDark ? "rgba(201,168,76,0.35)" : "rgba(0,52,118,0.15)",
              background: isDark ? "rgba(201,168,76,0.08)" : "rgba(0,52,118,0.04)",
            }}
            aria-hidden
          >
            <MapPin className={`h-6 w-6 ${mapAccent}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={`text-base font-extrabold sm:text-lg ${titleClass}`}>{office.label}</h3>
            <p className={`mt-2 text-sm leading-relaxed ${textMuted}`}>{office.address}</p>
            <p className={`mt-1.5 text-sm ${textMain}`}>
              Τηλ.:{" "}
              <a href={office.phoneHref} className="font-semibold text-[#C9A84C] hover:underline">
                {office.phone}
              </a>
            </p>
            <p className={`text-sm ${textMuted}`}>Fax: {office.fax}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
          <a
            href={office.mapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold text-[#0f172a] shadow-md transition hover:brightness-105"
            style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
          >
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            Άνοιγμα στο Google Maps
          </a>
          <a
            href={office.directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[#C9A84C]/50 bg-transparent px-4 py-3 text-sm font-extrabold text-[#C9A84C] transition hover:bg-[#C9A84C]/10"
          >
            <Navigation className="h-4 w-4 shrink-0" aria-hidden />
            Οδηγίες
          </a>
        </div>
      </div>
    </div>
  );
}

export function PortalOfficeMapsSection({ variant, heading }: OfficeMapsSectionProps) {
  const h = heading ?? (variant === "light" ? "Πολιτικά γραφεία & εντοπισμός" : "Πολιτικά γραφεία");
  return (
    <div className="w-full min-w-0">
      {variant === "light" ? (
        <h2 className="text-center text-xl font-extrabold text-[#003476] sm:text-2xl">{h}</h2>
      ) : (
        <h2 className="text-center text-xs font-bold uppercase tracking-[0.08em] text-[#C9A84C]">{h}</h2>
      )}
      {variant === "light" && (
        <div
          className="mx-auto mt-3 h-1 w-20 rounded-full"
          style={{ background: "linear-gradient(90deg, #C9A84C, #8B6914)" }}
          aria-hidden
        />
      )}
      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch">
        <OfficeMapCard office={OFFICES.agrinio} variant={variant} />
        <OfficeMapCard office={OFFICES.athens} variant={variant} />
      </div>
    </div>
  );
}
