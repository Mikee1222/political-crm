"use client";

import { Navigation } from "lucide-react";

const GOOGLE_MAPS_KEY = "AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY";

const OFFICES = {
  agrinio: {
    label: "Πολιτικό Γραφείο — Αγρίνιο",
    address: "Χαριλάου Τρικούπη 7, 301 00 Αγρίνιο",
    phone: "26410-46603",
    phoneHref: "tel:+302641046603",
    fax: "26410-46605",
    embedQuery: "Χαριλάου+Τρικούπη+7,+Αγρίνιο+301+00",
    directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=Χαριλάου+Τρικούπη+7,+Αγρίνιο",
  },
  athens: {
    label: "Πολιτικό Γραφείο — Αθήνα",
    address: "Σέκερη 1, 106 71 Αθήνα",
    phone: "210-8820388",
    phoneHref: "tel:+302108820388",
    fax: "210-3675646",
    embedQuery: "Σέκερη+1,+Αθήνα+106+71",
    directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=Σέκερη+1,+Αθήνα+106+71",
  },
} as const;

function officeEmbedSrc(query: string) {
  return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=${query}`;
}

type OfficeMapsSectionProps = {
  variant: "light" | "dark";
  heading?: string;
};

function OfficeMapCard({ office, variant }: { office: (typeof OFFICES)[keyof typeof OFFICES]; variant: "light" | "dark" }) {
  const isDark = variant === "dark";
  const textMuted = isDark ? "text-slate-400" : "text-slate-600";
  const textMain = isDark ? "text-slate-200" : "text-[#1A1A2E]";
  const titleClass = isDark ? "text-white" : "text-[#0f172a]";

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border shadow-sm",
        isDark ? "border-slate-700/80 bg-[#0f141c]" : "border-[#E2E8F0] bg-white",
      ].join(" ")}
    >
      <div className="p-4 sm:p-5">
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
      <div className="px-4 pb-3 sm:px-5">
        <iframe
          title={`Χάρτης — ${office.label}`}
          src={officeEmbedSrc(office.embedQuery)}
          width="100%"
          height={300}
          className="border-0"
          style={{ border: 0, borderRadius: 12 }}
          allowFullScreen
          loading="lazy"
        />
        <a
          href={office.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold text-[#0f172a] shadow-md transition hover:brightness-105"
          style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
        >
          <Navigation className="h-4 w-4 shrink-0" aria-hidden />
          Οδηγίες
        </a>
      </div>
    </div>
  );
}

export function PortalOfficeMapsSection({ variant, heading }: OfficeMapsSectionProps) {
  const h =
    heading ??
    (variant === "light" ? "Πολιτικά γραφεία & χάρτες" : "Χάρτες πολιτικών γραφείων");
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
