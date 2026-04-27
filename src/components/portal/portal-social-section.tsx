"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { loadTikTokEmbedScript } from "@/lib/tiktok-embed";

const ND = "#003476";
const GOLD = "#C9A84C";

type Settings = {
  show_tiktok: boolean;
  show_facebook: boolean;
  show_instagram: boolean;
  instagram_follower_label: string | null;
};

type TabId = "tiktok" | "facebook" | "instagram";

type SocialPayload = {
  settings: Settings;
  tiktok: { id: string; url: string; blockquoteHtml: string | null }[];
  facebook: { id: string; url: string; iframeSrc: string }[];
};

function TiktokGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.98-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.98-6.98C15.667.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function TiktokCard({ blockquoteHtml, url }: { blockquoteHtml: string | null; url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mutedU, setMutedU] = useState(true);

  useEffect(() => {
    if (!blockquoteHtml || !ref.current) {
      if (!blockquoteHtml) setReady(true);
      return;
    }
    ref.current.innerHTML = blockquoteHtml;
    void loadTikTokEmbedScript()
      .then(() => {
        setTimeout(() => setReady(true), 500);
      })
      .catch(() => {
        setReady(true);
      });
  }, [blockquoteHtml]);

  if (!blockquoteHtml) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/50 p-4 text-center text-sm text-white/70">
        <p>Το βίντεο δεν μπόρεσε να ενσωματωθεί. Ελέγξτε το URL στο CRM.</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 font-semibold underline"
          style={{ color: GOLD }}
        >
          Άνοιγμα στο TikTok
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black shadow-xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <TiktokGlyph className="h-5 w-5 text-white" />
        <span className="text-sm font-bold tracking-tight text-white/95">TikTok</span>
      </div>
      <div className="relative flex min-h-[420px] flex-1 items-stretch">
        <div
          className="portal-tiktok-embed relative w-full min-w-0 flex-1 [&_blockquote.tiktok-embed]:!m-0 [&_blockquote.tiktok-embed]:!max-w-none [&_blockquote.tiktok-embed]:!min-w-0"
          ref={ref}
        />
        {!ready && (
          <div
            className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/35"
            aria-hidden
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <Play className="h-8 w-8 text-white" fill="white" />
            </div>
          </div>
        )}
        <button
          type="button"
          className="absolute bottom-3 right-3 z-[2] rounded-full border border-white/20 bg-black/60 p-2.5 text-white shadow-lg backdrop-blur transition hover:bg-black/80"
          onClick={() => setMutedU((m) => !m)}
          title="Ο έλεγχος ήχου γίνεται από τον ενσωματωμένο παίκτη TikTok"
        >
          {mutedU ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

function visibleOrder(s: Settings): TabId[] {
  const o: TabId[] = [];
  if (s.show_tiktok) o.push("tiktok");
  if (s.show_facebook) o.push("facebook");
  if (s.show_instagram) o.push("instagram");
  return o;
}

export function PortalSocialSection() {
  const [data, setData] = useState<SocialPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("tiktok");

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch("/api/portal/social", { cache: "no-store" });
    if (!res.ok) {
      setErr("Προσωρινό σφάλμα φόρτωσης.");
      return;
    }
    const j = (await res.json()) as SocialPayload;
    setData(j);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const order = visibleOrder(data.settings);
    if (order.length === 0) return;
    if (!order.includes(tab)) {
      setTab(order[0]!);
    }
  }, [data, tab]);

  if (err && !data) {
    return null;
  }
  if (data) {
    const s = data.settings;
    if (!s.show_tiktok && !s.show_facebook && !s.show_instagram) {
      return null;
    }
  } else {
    return (
      <section className="bg-[#F8FAFC] py-12 sm:py-16" aria-hidden>
        <div className="mx-auto max-w-6xl animate-pulse px-4 sm:px-6">
          <div className="h-8 w-64 rounded-lg bg-slate-200" />
          <div className="mt-4 h-10 w-full max-w-md rounded-lg bg-slate-200" />
          <div className="mt-8 h-96 rounded-2xl bg-slate-200" />
        </div>
      </section>
    );
  }

  const s = data!.settings;
  const hasT = s.show_tiktok;
  const hasF = s.show_facebook;
  const hasI = s.show_instagram;
  if (!hasT && !hasF && !hasI) return null;
  const vIs = visibleOrder(s);
  const active: TabId = vIs.includes(tab) ? tab : (vIs[0] ?? "tiktok");

  return (
    <section className="bg-[#F1F5F9] py-16 sm:py-20" aria-labelledby="portal-social-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="portal-social-heading"
          className="text-center text-2xl font-extrabold sm:text-3xl"
          style={{ color: ND, fontWeight: 800 }}
        >
          Ακολουθήστε τον Κώστα Καραγκούνη
        </h2>
        <div
          className="mx-auto mt-3 h-1 w-24 rounded-full"
          style={{ background: "linear-gradient(90deg, #C9A84C, #8B6914)" }}
          aria-hidden
        />
        <div
          className="mt-8 flex flex-wrap justify-center gap-2"
          role="tablist"
          aria-label="Πλατφόρμες κοινωνικών δικτύων"
        >
          {hasT && (
            <button
              type="button"
              role="tab"
              aria-selected={active === "tiktok"}
              onClick={() => setTab("tiktok")}
              className={`inline-flex min-w-[120px] items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-extrabold transition ${
                active === "tiktok"
                  ? "bg-zinc-950 text-white ring-2 ring-zinc-950/30"
                  : "bg-white/90 text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              <TiktokGlyph className="h-4 w-4" />
              TikTok
            </button>
          )}
          {hasF && (
            <button
              type="button"
              role="tab"
              aria-selected={active === "facebook"}
              onClick={() => setTab("facebook")}
              className={`inline-flex min-w-[120px] items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-extrabold transition ${
                active === "facebook" ? "text-white ring-2 ring-white/20" : "bg-white/90 text-[#1877F2] ring-1 ring-slate-200"
              }`}
              style={active === "facebook" ? { backgroundColor: "#1877F2" } : undefined}
            >
              <FacebookGlyph className="h-4 w-4" />
              Facebook
            </button>
          )}
          {hasI && (
            <button
              type="button"
              role="tab"
              aria-selected={active === "instagram"}
              onClick={() => setTab("instagram")}
              className={`inline-flex min-w-[120px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-5 py-2.5 text-sm font-extrabold text-white transition ${
                active === "instagram" ? "ring-2 ring-fuchsia-300" : "opacity-90 ring-0 hover:opacity-100"
              }`}
            >
              <InstagramGlyph className="h-4 w-4" />
              Instagram
            </button>
          )}
        </div>

        {active === "tiktok" && hasT && (
          <div className="mt-8" role="tabpanel" tabIndex={0}>
            {data.tiktok.length === 0 ? (
              <p className="text-center text-slate-600">Σύντομα βίντεο — επιστρέξτε αργότερα.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.tiktok.map((t) => (
                  <TiktokCard key={t.id} blockquoteHtml={t.blockquoteHtml} url={t.url} />
                ))}
              </div>
            )}
          </div>
        )}

        {active === "facebook" && hasF && (
          <div className="mt-8" role="tabpanel" tabIndex={0}>
            <h3
              className="mb-4 text-center text-lg font-extrabold"
              style={{ color: "#1877F2" }}
            >
              Ακολουθήστε μας στο Facebook
            </h3>
            {data.facebook.length === 0 ? (
              <p className="text-center text-slate-600">Προσθέστε συνδέσμους Facebook από το CRM.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.facebook.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-col overflow-hidden rounded-2xl border-2 p-0 shadow-lg"
                    style={{ borderColor: "#1877F2", background: "linear-gradient(180deg, #E7F0FF, #fff)" }}
                  >
                    <div
                      className="flex items-center gap-2 px-3 py-2.5"
                      style={{ backgroundColor: "#1877F2" }}
                    >
                      <FacebookGlyph className="h-4 w-4 text-white" />
                      <span className="text-sm font-bold text-white">Facebook</span>
                    </div>
                    <div className="min-h-0 w-full flex-1 overflow-x-auto p-1">
                      <iframe
                        title="Facebook"
                        src={f.iframeSrc}
                        width={340}
                        height={500}
                        style={{ border: "none", overflow: "hidden", maxWidth: "100%" }}
                        className="mx-auto block w-[340px] max-w-full"
                        scrolling="no"
                        allowFullScreen
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {active === "instagram" && hasI && (
          <div className="mt-8 flex justify-center" role="tabpanel" tabIndex={0}>
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl border-0 bg-gradient-to-br p-[2px] shadow-2xl"
              style={{
                backgroundImage: "linear-gradient(135deg, #f093fb, #8b4fc0, #f5576c)",
              }}
            >
              <div className="h-full w-full rounded-[14px] bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-center text-white">
                <h3 className="text-lg font-extrabold">Ακολουθήστε μας στο Instagram</h3>
                <div className="mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 p-0.5">
                  <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-slate-900">
                    <InstagramGlyph className="h-10 w-10 text-white" />
                  </div>
                </div>
                <p className="mt-4 text-2xl font-extrabold">@karagounisk</p>
                {s.instagram_follower_label ? (
                  <p className="mt-1 text-sm text-white/80">{s.instagram_follower_label}</p>
                ) : null}
                <a
                  href="https://www.instagram.com/karagounisk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex w-full max-w-xs items-center justify-center rounded-xl py-3.5 text-base font-extrabold text-[#0f172a] shadow-lg transition hover:brightness-105"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
                >
                  Ακολουθήστε
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
