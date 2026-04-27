import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BookOpen,
  Calendar,
  GraduationCap,
  Heart,
  Landmark,
  Sparkles,
  User,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ND = "#003476";
const GOLD = "#C9A84C";

export default function PortalAboutPage() {
  return (
    <div className="min-w-0">
      {/* Hero */}
      <section className="relative flex min-h-[min(88vh,820px)] flex-col overflow-hidden text-white lg:min-h-[72vh]">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, #003476 0%, #001a3d 52%, #050D1A 100%)",
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 portal-hero-particles opacity-50" aria-hidden />
        <div className="pointer-events-none absolute inset-0 portal-dots opacity-30" aria-hidden />
        <div className="portal-hero-greek-watermark--mobile pointer-events-none absolute inset-0 lg:hidden" aria-hidden />
        <div
          className="portal-hero-greek-watermark pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] lg:block"
          aria-hidden
        />

        <div className="relative z-[1] flex w-full flex-1 flex-col pt-4 lg:flex-row lg:items-stretch lg:pt-0">
          <div className="order-1 flex w-full min-h-[220px] flex-none items-end justify-center px-4 pt-6 sm:min-h-[280px] lg:order-2 lg:min-h-0 lg:w-[42%] lg:max-w-[42%] lg:flex-1 lg:px-0">
            <div
              className="pointer-events-none absolute bottom-[8%] left-1/2 h-[min(45vh,420px)] w-[min(90%,400px)] -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-amber-300/20 to-amber-600/5 blur-[56px]"
              aria-hidden
            />
            <Image
              src="/hero-karagkounis.png"
              alt="Κώστας Καραγκούνης"
              width={800}
              height={1100}
              priority
              className="relative z-[1] h-[min(32vh,320px)] w-auto max-w-[min(88vw,380px)] object-contain object-bottom sm:h-[min(36vh,400px)] lg:h-[min(70vh,700px)] lg:max-h-[min(80vh,760px)] lg:max-w-full"
              sizes="(max-width: 1023px) 88vw, 38vw"
            />
          </div>
          <div className="order-2 flex flex-1 flex-col justify-center px-5 pb-10 pt-2 sm:px-10 sm:pb-12 lg:order-1 lg:w-[58%] lg:max-w-[58%] lg:pl-10 lg:pr-6">
            <nav className="mb-4 text-xs text-white/60 sm:text-sm">
              <Link href="/portal" className="font-semibold text-white/80 hover:underline">
                Αρχική
              </Link>
              <span className="mx-1.5 text-white/40">/</span>
              <span className="text-white/90">Βιογραφικό</span>
            </nav>
            <h1 className="portal-hero-title text-balance text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.5rem]">
              Κώστας Καραγκούνης
            </h1>
            <div
              className="mt-4 h-1 w-44 max-w-full rounded-full sm:w-48"
              style={{ background: "linear-gradient(90deg, #C9A84C, #8B6914)" }}
              aria-hidden
            />
            <p className="portal-hero-subtitle mt-5 max-w-2xl text-balance text-lg text-white/75">
              Υφυπουργός Εργασίας &amp; Κοινωνικής Ασφάλισης | Βουλευτής Αιτωλοακαρνανίας
            </p>
            <p className="mt-3 max-w-2xl text-sm text-white/55 sm:text-base">
              Σπουδή, πολιτική ευθύνη και αφοσίωση στους πολίτες της περιοχής — με πλήρη βιογραφία παρακάτω.
            </p>
          </div>
        </div>
      </section>

      <div className="bg-[#FAFBFC] pb-16 pt-4 sm:pb-20 sm:pt-6">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          {/* Biography image card */}
          <div
            className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border-[3px] bg-white p-2 shadow-xl"
            style={{ borderColor: GOLD, boxShadow: "0 8px 40px rgba(0, 52, 118, 0.08), 0 0 0 1px rgba(201, 168, 76, 0.15) inset" }}
          >
            <div className="overflow-hidden rounded-xl border border-slate-100/80">
              <Image
                src="/viografiko2-682x1024.jpg"
                alt="Βιογραφικό — Κώστας Καραγκούνης"
                width={682}
                height={1024}
                className="h-auto w-full object-contain"
                priority
                sizes="(max-width: 640px) 100vw, 36rem"
              />
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-3xl space-y-12 px-4 sm:px-6">
          {/* Academics */}
          <section aria-labelledby="about-academic">
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              >
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <h2 id="about-academic" className="text-xl font-extrabold sm:text-2xl" style={{ color: ND }}>
                Ακαδημαϊκά επιτεύγματα
              </h2>
            </div>
            <ul className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5 text-[#475569] shadow-sm sm:p-6">
              {[
                { Icon: BookOpen, t: "Νομική — ΕΚΠΑ" },
                { Icon: BookOpen, t: "Μεταπτυχιακό UEL Λονδίνου (άριστα) — Διεθνές δίκαιο" },
                { Icon: Sparkles, t: "Πανεπιστήμιο Εδιμβούργου — Πνευματική ιδιοκτησία" },
                { Icon: Award, t: "Harvard Global Change Agents Program (2011)" },
                { Icon: BookOpen, t: "Υποψήφιος Διδάκτωρ, Οικονομικό Πανεπιστήμιο Αθηνών" },
              ].map(({ Icon, t }) => (
                <li key={t} className="flex gap-3 text-sm leading-relaxed sm:text-base">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700/80" />
                  {t}
                </li>
              ))}
            </ul>
          </section>

          {/* Political career */}
          <section aria-labelledby="about-politics">
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              >
                <Landmark className="h-6 w-6 text-white" />
              </div>
              <h2 id="about-politics" className="text-xl font-extrabold sm:text-2xl" style={{ color: ND }}>
                Πολιτική καριέρα
              </h2>
            </div>
            <div className="relative pl-0">
              <div
                className="absolute bottom-0 left-3 top-1 w-0.5 rounded-full sm:left-3.5"
                style={{ background: "linear-gradient(180deg, #C9A84C, rgba(0, 52, 118, 0.15))" }}
                aria-hidden
              />
              <ul className="space-y-0">
                {[
                  { y: "2009", t: "Βουλευτής ΝΔ, Αιτωλοακαρνανία" },
                  { y: "2012", t: "Αναπληρωτής Υπουργός Δικαιοσύνης (κυβέρνηση Σαμαρά)" },
                  { y: "2015", t: "Εκπρόσωπος Τύπου ΝΔ" },
                  { y: "2015", t: "Πρόεδρος, Κοινοβουλευτική Ομάδα φιλίας Ελλάδας–Ισραήλ" },
                ].map((row) => (
                  <li key={row.y + row.t} className="relative flex gap-3 pb-9 pl-0 last:pb-0 sm:gap-4">
                    <div className="z-[1] flex w-7 shrink-0 justify-center sm:w-8" aria-hidden>
                      <div
                        className="h-2.5 w-2.5 self-start rounded-full ring-2 ring-amber-100 sm:h-3 sm:w-3"
                        style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", marginTop: "0.4rem" }}
                      />
                    </div>
                    <div className="min-w-0 pt-0">
                      <p
                        className="font-mono text-sm font-extrabold"
                        style={{ color: ND }}
                      >
                        {row.y}
                      </p>
                      <p className="mt-1.5 text-sm font-medium text-[#334155] sm:text-base">{row.t}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Personal */}
          <section aria-labelledby="about-personal" className="pb-2">
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              >
                <User className="h-6 w-6 text-white" />
              </div>
              <h2 id="about-personal" className="text-xl font-extrabold sm:text-2xl" style={{ color: ND }}>
                Προσωπικά
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-1">
              {[
                { Icon: Calendar, t: "Γεννήθηκε το 1975" },
                { Icon: Landmark, t: "Δικηγόρος Αθηνών" },
                { Icon: Heart, t: "Παντρεμένος, πατέρας τριών παιδιών" },
              ].map(({ Icon, t }) => (
                <div
                  key={t}
                  className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#0d5b9e]" />
                  <p className="text-sm text-[#475569] sm:text-base">{t}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="pt-2 text-center">
            <Link
              href="/portal"
              className="text-sm font-bold hover:underline"
              style={{ color: ND }}
            >
              ← Επιστροφή στην αρχική
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
