import Link from "next/link";
import { supabaseAnon } from "@/lib/supabase/anon";
import { ArrowDown, ArrowRight, ClipboardList, LineChart, Newspaper } from "lucide-react";

export const dynamic = "force-dynamic";

const ND = "#003476";
const GOLD = "#C9A84C";

export default async function PortalHomePage() {
  const { data: posts } = await supabaseAnon
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
      {/* HERO */}
      <section className="relative flex min-h-[100dvh] min-h-[100svh] flex-col justify-between overflow-hidden text-white">
        <div
          className="absolute inset-0 portal-hero-particles"
          style={{
            background: "linear-gradient(135deg, #003476 0%, #001a3d 60%, #0a0f1a 100%)",
          }}
        />
        <div className="portal-dots" aria-hidden />
        <div className="relative z-[1] mx-auto flex max-w-4xl flex-1 flex-col justify-center px-4 pb-24 pt-20 text-center sm:px-6 sm:pb-32 sm:pt-24">
          <p className="text-lg font-medium text-white/90 sm:text-xl">Γεια σας, είμαι ο</p>
          <h1
            className="mt-2 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-[56px] md:leading-[1.1]"
            style={{ lineHeight: 1.1 }}
          >
            Κώστας Καραγκούνης
          </h1>
          <div
            className="mx-auto mt-4 h-1 w-32 rounded-full"
            style={{ background: "linear-gradient(90deg, #C9A84C, #8B6914)" }}
            aria-hidden
          />
          <p className="mt-5 max-w-2xl text-base text-white/60 sm:text-lg">
            Υφυπουργός Εργασίας &amp; Κοινωνικής Ασφάλισης | Βουλευτής Αιτωλοακαρνανίας
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/portal/requests/new"
              className="inline-flex w-full max-w-xs items-center justify-center rounded-xl px-8 py-4 text-base font-extrabold text-[#0f172a] shadow-lg transition hover:brightness-105 sm:w-auto"
              style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
            >
              Υποβολή Αιτήματος
            </Link>
            <Link
              href="/portal/news"
              className="inline-flex w-full max-w-xs items-center justify-center rounded-xl border-2 border-white/90 px-8 py-4 text-base font-bold text-white transition hover:bg-white/10 sm:w-auto"
            >
              Μάθετε περισσότερα
            </Link>
          </div>
        </div>
        <div className="relative z-[1] mx-auto w-full max-w-4xl px-4 pb-8 sm:px-6">
          <div className="grid grid-cols-3 gap-2 border-t border-white/10 py-6 text-center sm:gap-4 sm:py-8">
            {[
              { n: "15+", l: "Χρόνια" },
              { n: "50.000+", l: "Επαφές" },
              { n: "Αιτωλοακαρνανία", l: "Περιφέρεια" },
            ].map((s) => (
              <div key={s.l}>
                <p className="text-lg font-extrabold sm:text-2xl" style={{ color: GOLD }}>
                  {s.n}
                </p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-white/60 sm:text-xs">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-[1] flex justify-center pb-6">
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
            Υπηρεσίες γραφείου με διαφάνεια και άμεση παρακολούθηση.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
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
            ].map(({ title, d, href, Icon }) => (
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

      {/* CTA */}
      <section
        className="py-16"
        style={{
          background: "linear-gradient(135deg, #003476 0%, #001a3d 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="text-2xl font-extrabold text-white sm:text-3xl">
            Εγγραφείτε και υποβάλετε το αίτημά σας σήμερα
          </p>
          <Link
            href="/portal/register"
            className="mt-8 inline-flex rounded-xl px-10 py-4 text-base font-extrabold text-[#0f172a] shadow-lg"
            style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
          >
            Εγγραφή τώρα
          </Link>
        </div>
      </section>
    </div>
  );
}
