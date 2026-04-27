import Image from "next/image";
import Link from "next/link";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { createClient } from "@/lib/supabase/server";
import { PortalSocialSection } from "@/components/portal/portal-social-section";
import { ArrowDown, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const ND = "#003476";
const GOLD = "#C9A84C";

export default async function PortalHomePage() {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const supabase = getPortalServiceOrAnon();
  const { data: posts } = await supabase
    .from("news_posts")
    .select("id, title, slug, excerpt, cover_image, category, published_at, created_at")
    .eq("published", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(3);

  const list = (posts ?? []) as {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    cover_image: string | null;
    category: string;
    published_at: string | null;
    created_at: string;
  }[];

  return (
    <div className="min-w-0">
      {/* HERO — split-screen: left copy + right photo (stacked on mobile) */}
      <section className="relative flex min-h-[100dvh] min-h-[100svh] flex-col overflow-hidden text-white">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, #003476 0%, #001a3d 52%, #050D1A 100%)",
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 portal-hero-particles opacity-50" aria-hidden />
        <div className="pointer-events-none absolute inset-0 portal-dots opacity-35" aria-hidden />
        <div className="portal-hero-greek-watermark--mobile pointer-events-none absolute inset-0 lg:hidden" aria-hidden />
        <div
          className="portal-hero-greek-watermark pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] lg:block"
          aria-hidden
        />

        <div className="relative z-[1] flex w-full min-h-0 flex-1 flex-col lg:min-h-0 lg:flex-row lg:items-stretch">
          <div className="order-2 flex w-full min-h-0 flex-1 flex-col justify-center px-5 pb-8 pt-4 sm:px-8 sm:pb-10 sm:pt-2 lg:order-1 lg:max-w-[55%] lg:w-[55%] lg:shrink-0 lg:px-8 lg:py-12 lg:pl-10 lg:pr-2 xl:pl-14">
            <div className="text-center lg:max-w-xl lg:text-left">
              <h1
                className="portal-hero-title text-balance text-[1.9rem] font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[52px] lg:leading-[1.08]"
                style={{ fontWeight: 800 }}
              >
                Κώστας Καραγκούνης
              </h1>
              <div
                className="mx-auto mt-4 h-1 w-44 max-w-full rounded-full sm:w-48 lg:mx-0"
                style={{ background: "linear-gradient(90deg, #C9A84C, #8B6914)" }}
                aria-hidden
              />
              <p className="portal-hero-subtitle mt-5 max-w-xl text-balance text-[18px] leading-relaxed text-white/70 lg:mx-0">
                Υφυπουργός Εργασίας &amp; Κοινωνικής Ασφάλισης | Βουλευτής Αιτωλοακαρνανίας
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 lg:justify-start">
                <Link
                  href="/portal/about"
                  className="inline-flex w-full min-w-0 max-w-sm items-center justify-center rounded-xl px-8 py-3.5 text-base font-extrabold text-[#0f172a] shadow-lg transition hover:brightness-105 sm:w-auto sm:py-4"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
                >
                  Μάθετε περισσότερα
                </Link>
                <Link
                  href="/portal/register"
                  className="inline-flex w-full max-w-sm items-center justify-center rounded-xl border-2 border-white/90 px-8 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-white/10 sm:w-auto sm:py-4"
                >
                  Εγγραφή
                </Link>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 -z-0 sm:hidden" aria-hidden>
            <div className="absolute bottom-[6%] left-1/2 h-[min(50vh,500px)] w-[min(92%,460px)] -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-amber-300/25 to-amber-600/10 blur-[64px]" />
          </div>

          <div className="relative order-1 -mt-1 min-h-[min(40vh,380px)] w-full shrink-0 sm:min-h-0 sm:pt-0 lg:order-2 lg:ml-auto lg:min-h-0 lg:max-w-[50%] lg:flex-1 lg:pt-0">
            <div
              className="pointer-events-none absolute bottom-[8%] right-0 z-0 hidden h-[min(45vh,520px)] w-[min(90vw,440px)] max-w-full rounded-[50%] bg-gradient-to-b from-amber-300/20 to-amber-600/10 blur-[64px] lg:bottom-0 lg:right-0 lg:block"
              aria-hidden
            />
            <div className="relative z-[1] h-[min(40vh,400px)] w-full max-w-[min(92vw,480px)] sm:max-w-full lg:absolute lg:bottom-0 lg:right-0 lg:left-auto lg:top-0 lg:h-full lg:min-h-[50vh] lg:max-w-[min(100%,min(48vw,560px))]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-karagkounis.png"
                alt="Κώστας Καραγκούνης"
                className="pointer-events-none select-none"
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  height: "100%",
                  width: "auto",
                  objectFit: "contain",
                  background: "transparent",
                }}
              />
            </div>
          </div>
        </div>

        <div className="relative z-[1] mx-auto w-full max-w-4xl px-4 pb-4 sm:px-6">
          <div className="grid grid-cols-3 gap-2 py-4 text-center sm:gap-4 sm:py-6">
            {[
              { n: "15+", l: "Χρόνια" },
              { n: "8+", l: "Χρόνια Υπουργός" },
              { n: "Αιτωλοακαρνανία", l: "Περιφέρεια" },
            ].map((s) => (
              <div key={s.l}>
                <p className="text-base font-extrabold sm:text-2xl" style={{ color: GOLD }}>
                  {s.n}
                </p>
                <p className="mt-1 text-[9px] font-medium uppercase leading-tight tracking-wide text-white/65 sm:text-xs">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-[1] flex justify-center pb-5 sm:pb-6">
          <a
            href="#news-preview"
            className="portal-scroll-hint flex flex-col items-center gap-1 text-white/50"
            aria-label="Κύλιση προς τα νέα"
          >
            <span className="text-xs uppercase tracking-widest">Κύλιση</span>
            <ArrowDown className="h-5 w-5" />
          </a>
        </div>
      </section>

      {/* Mini bio — link to full biography */}
      <section
        className="border-b border-[#E2E8F0] bg-gradient-to-b from-[#F8FAFC] to-white py-8 sm:py-10"
        aria-labelledby="portal-mini-bio-heading"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div
            className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition hover:shadow-md sm:flex-row sm:items-stretch sm:gap-6 sm:p-5"
            style={{ boxShadow: "0 4px 24px rgba(0, 52, 118, 0.06)" }}
          >
            <div
              className="relative mx-auto h-24 w-24 shrink-0 border-2 bg-transparent sm:mx-0 sm:h-28 sm:w-28"
              style={{ borderColor: GOLD }}
            >
              <div className="relative h-full w-full bg-transparent">
                <Image
                  src="/hero-karagkounis.png"
                  alt=""
                  fill
                  unoptimized
                  className="object-contain object-bottom"
                  style={{ background: "transparent" }}
                  sizes="112px"
                />
              </div>
            </div>
            <div className="min-w-0 flex-1 pt-2 sm:pt-0">
              <h2 id="portal-mini-bio-heading" className="sr-only">
                Σύντομο βιογραφικό
              </h2>
              <div className="space-y-2 text-sm leading-relaxed text-[#475569] sm:text-base">
                <p>Ο Κώστας Καραγκούνης υπηρετεί ως Υφυπουργός Εργασίας &amp; Κοινωνικής Ασφάλισης και Βουλευτής Αιτωλοακαρνανίας.</p>
                <p>
                  Νομικές σπουδές στο ΕΚΠΑ, μεταπτυχιακό UEL (Λονδίνο) και ακαδημαϊκή εμπειρία στο εξωτερικό· μακρά
                  πολιτική διαδρομή στη Νέα Δημοκρατία, με ευθύνες σε κυβέρνηση και στο κοινοβούλιο.
                </p>
                <p>Γεννήθηκε το 1975, εργάζεται ως δικηγόρος, και συνεχίζει με αφοσίωση στους πολίτες του νομού.</p>
              </div>
              <Link
                href="/portal/about"
                className="group mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold sm:text-base"
                style={{ color: ND }}
              >
                Διαβάστε περισσότερα
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* NEWS PREVIEW */}
      {list.length > 0 && (
        <section id="news-preview" className="scroll-mt-20 bg-[#F1F5F9] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-2">
              <h2
                className="text-2xl font-bold"
                style={{ color: ND, fontWeight: 800 }}
              >
                Τελευταία Νέα
              </h2>
              <Link
                href="/portal/news"
                className="text-sm font-bold hover:underline"
                style={{ color: ND }}
              >
                Δείτε όλα →
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              {list.map((p) => (
                <Link
                  key={p.id}
                  href={`/portal/news/${p.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md"
                >
                  <div
                    className="relative aspect-[16/10] w-full overflow-hidden"
                    style={{
                      background: p.cover_image
                        ? `url(${p.cover_image}) center / cover no-repeat, linear-gradient(135deg, #003476, #0a0f1a)`
                        : "linear-gradient(135deg, #003476 0%, #0a0f1a 100%)",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span
                      className="absolute left-3 top-3 inline rounded-full px-2.5 py-0.5 text-[11px] font-bold text-[#0f172a]"
                      style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
                    >
                      {p.category}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 text-lg font-bold text-[#1A1A2E] group-hover:underline">
                      {p.title}
                    </h3>
                    {p.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-[#64748B]">{p.excerpt}</p>
                    )}
                    <p className="mt-2 text-xs text-[#64748B]">
                      {p.published_at
                        ? new Date(p.published_at).toLocaleDateString("el-GR")
                        : new Date(p.created_at).toLocaleDateString("el-GR")}
                    </p>
                    <span
                      className="mt-2 text-sm font-bold"
                      style={{ color: ND }}
                    >
                      Διαβάστε →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-[#E2E8F0] bg-white py-12 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-extrabold" style={{ color: ND, fontWeight: 800 }}>
            Επικοινωνία
          </h2>
          <div
            className="mx-auto mt-3 h-1 w-20 rounded-full"
            style={{ background: "linear-gradient(90deg, #C9A84C, #8B6914)" }}
            aria-hidden
          />
          <p className="mx-auto mt-4 max-w-xl text-base text-[#64748B]">Πολιτικά γραφεία Αγρίνιο και Αθήνα, τηλέφωνα και σύνδεσμοι χάρτη.</p>
          <Link
            href="/portal/contact"
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-extrabold text-white shadow-md transition hover:brightness-105"
            style={{ background: "linear-gradient(135deg, #003476, #001a3d)" }}
          >
            Στοιχεία επικοινωνίας
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PortalSocialSection />

      {/* CTA */}
      <section
        className="py-16"
        style={{
          background: "linear-gradient(135deg, #003476 0%, #001a3d 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          {user ? (
            <>
              <p className="text-xl font-extrabold text-white sm:text-2xl">Καλώς ήρθατε στην πύλη πολιτών.</p>
              <Link
                href="/portal/dashboard"
                className="mt-8 inline-flex items-center justify-center gap-1 rounded-xl border-2 border-white/50 px-8 py-3 text-sm font-extrabold text-white transition hover:bg-white/10"
              >
                Πίνακας ελέγχου
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <>
              <p className="text-2xl font-extrabold text-white sm:text-3xl">
                Δημιουργήστε λογαριασμό για πλήρη πρόσβαση στην πύλη
              </p>
              <Link
                href="/portal/register"
                className="mt-8 inline-flex rounded-xl px-10 py-4 text-base font-extrabold text-[#0f172a] shadow-lg"
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              >
                Εγγραφή τώρα
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
