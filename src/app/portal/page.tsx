import Image from "next/image";
import Link from "next/link";
import { getPortalServiceOrAnon } from "@/lib/supabase/portal-service";
import { createClient } from "@/lib/supabase/server";
import { PortalSocialSection } from "@/components/portal/portal-social-section";
import { ArrowDown, ArrowRight, ClipboardList, LineChart, MapPin, Newspaper, User } from "lucide-react";

export const dynamic = "force-dynamic";

const ND = "#003476";
const GOLD = "#C9A84C";

export default async function PortalHomePage() {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const isLoggedIn = Boolean(user);

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

        <div className="relative z-[1] flex w-full min-h-0 flex-1 flex-col lg:min-h-[min(100dvh,100%)] lg:flex-row lg:items-stretch">
          <div className="relative order-1 flex w-full min-h-0 flex-none items-end justify-center px-4 pt-8 sm:pt-10 lg:order-2 lg:w-[45%] lg:max-w-[45%] lg:flex-1 lg:px-0 lg:pt-0">
            <div
              className="pointer-events-none absolute bottom-[6%] left-1/2 h-[min(50vh,500px)] w-[min(92%,460px)] -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-amber-300/25 to-amber-600/10 blur-[64px] sm:bottom-[4%] sm:blur-[80px]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-[20%] left-1/2 h-[30%] w-[55%] -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl"
              aria-hidden
            />
            <Image
              src="/hero-karagkounis.png"
              alt="Κώστας Καραγκούνης"
              width={900}
              height={1200}
              priority
              unoptimized
              sizes="(max-width: 1023px) 85vw, 40vw"
              className="relative z-[1] h-[min(38vh,360px)] w-auto max-w-[min(88vw,400px)] object-contain object-bottom sm:h-[min(40vh,420px)] sm:max-w-[min(80vw,480px)] lg:h-[min(100dvh-120px,920px)] lg:max-h-[min(100dvh,920px)] lg:max-w-[min(100%,min(100vw*0.4,500px))] lg:w-auto"
            />
          </div>

          <div className="order-2 flex w-full min-h-0 flex-1 flex-col justify-center px-5 pb-8 pt-4 sm:px-8 sm:pb-10 sm:pt-2 lg:order-1 lg:w-[55%] lg:max-w-[55%] lg:shrink-0 lg:px-8 lg:py-12 lg:pl-10 lg:pr-4 xl:pl-14">
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
        </div>

        <div className="relative z-[1] mx-auto w-full max-w-4xl border-t border-white/10 px-4 pb-4 sm:px-6">
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
            href="#features"
            className="portal-scroll-hint flex flex-col items-center gap-1 text-white/50"
            aria-label="Κύλιση προς τα κάτω"
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
              className="relative mx-auto h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 sm:mx-0 sm:h-28 sm:w-28"
              style={{ borderColor: GOLD }}
            >
              <Image
                src="/hero-karagkounis.png"
                alt=""
                width={120}
                height={120}
                unoptimized
                className="h-full w-full object-cover object-top"
                sizes="112px"
              />
            </div>
            <div className="min-w-0 flex-1 pt-2 sm:pt-0">
              <h2 id="portal-mini-bio-heading" className="sr-only">
                Σύντομο βιογραφικό
              </h2>
              <div className="space-y-2 text-sm leading-relaxed text-[#475569] sm:text-base">
                <p>Ο Κώστας Καραγκούνης υπηρετεί ως Υφυπουργός Εργασίας &amp; Κοινωνικής Ασφάλισης και Βουλευτής Αιτωλοακαρνανίας.</p>
                <p>
                  Νομικές σπουδές στο ΕΚΠΑ, μεταπτυχιακό UEL (Λονδίνο) και ακαδημαϊκή εμπειρία στο εξωτερικό· μακρά
                  πολιτική διαδρομή στη Νέα Δημοκρατία, με ευθύνες σε κυβέρνηση και Βουλή.
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

      {/* FEATURES */}
      <section id="features" className="scroll-mt-20 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2
            className="text-center text-2xl font-bold sm:text-3xl"
            style={{ color: ND, fontWeight: 800 }}
          >
            Πώς μπορώ να σας βοηθήσω;
          </h2>
          <div
            className="mx-auto mt-3 h-1 w-20 rounded-full"
            style={{ background: "linear-gradient(90deg, #C9A84C, #8B6914)" }}
            aria-hidden
          />
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-[#64748B]">
            {isLoggedIn
              ? "Υπηρεσίες γραφείου με διαφάνεια και άμεση παρακολούθηση."
              : "Βιογραφικό, νέα και επαφή με το γραφείο — εγγραφείτε για πλήρη πρόσβαση."}
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {(isLoggedIn
              ? [
                  {
                    title: "Υποβάλετε Αίτημα",
                    d: "Καταγράψτε το πρόβλημά σας και παρακολουθήστε την εξέλιξή του",
                    href: "/portal/requests/new",
                    Icon: ClipboardList,
                  },
                  {
                    title: "Παρακολουθήστε την Πορεία",
                    d: "Δείτε σε πραγματικό χρόνο την κατάσταση του αιτήματός σας",
                    href: "/portal/requests",
                    Icon: LineChart,
                  },
                  {
                    title: "Ενημερωθείτε",
                    d: "Νέα και ανακοινώσεις από τον βουλευτή και το γραφείο",
                    href: "/portal/news",
                    Icon: Newspaper,
                  },
                ]
              : [
                  {
                    title: "Βιογραφικό",
                    d: "Η πορεία, οι αρμοδιότητες και η πολιτική διαδρομή",
                    href: "/portal/about",
                    Icon: User,
                  },
                  {
                    title: "Νέα",
                    d: "Ανακοινώσεις και άρθρα από το γραφείο",
                    href: "/portal/news",
                    Icon: Newspaper,
                  },
                  {
                    title: "Επικοινωνία",
                    d: "Γραφεία, τηλέφωνα και χάρτης",
                    href: "/portal#portal-footer-contact",
                    Icon: MapPin,
                  },
                ]
            ).map(({ title, d, href, Icon }) => (
              <Link
                key={title}
                href={href}
                className="group flex flex-col rounded-2xl border border-[#E2E8F0] border-t-[3px] border-t-transparent bg-[#FAFBFC] p-6 shadow-sm transition duration-300 hover:-translate-y-2 hover:border-t-[#C9A84C] hover:shadow-lg"
              >
                <div
                  className="mb-4 flex h-20 w-20 items-center justify-center rounded-full"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
                >
                  <Icon className="h-9 w-9 text-white" strokeWidth={2} />
                </div>
                <h3 className="text-xl font-bold text-[#1A1A2E]">{title}</h3>
                <p className="mt-2 flex-1 text-base leading-relaxed text-[#64748B]">{d}</p>
                <span
                  className="mt-4 inline-flex items-center gap-1 text-sm font-bold"
                  style={{ color: ND }}
                >
                  Συνεχίστε <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* NEWS PREVIEW */}
      {list.length > 0 && (
        <section className="bg-[#F1F5F9] py-16 sm:py-20">
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

      <PortalSocialSection />

      {/* CTA */}
      <section
        className="py-16"
        style={{
          background: "linear-gradient(135deg, #003476 0%, #001a3d 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          {isLoggedIn ? (
            <>
              <p className="text-2xl font-extrabold text-white sm:text-3xl">
                Υποβάλετε αίτημα — παρακολουθήστε την εξέλιξη από την πύλη
              </p>
              <Link
                href="/portal/requests/new"
                className="mt-8 inline-flex rounded-xl px-10 py-4 text-base font-extrabold text-[#0f172a] shadow-lg"
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              >
                Υποβολή αιτήματος
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
