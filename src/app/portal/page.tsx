import Link from "next/link";
import { supabaseAnon } from "@/lib/supabase/anon";
import { Send, LineChart, Bell } from "lucide-react";

const ND = "#003476";
const GOLD = "#C9A84C";

export const dynamic = "force-dynamic";

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
    <div>
      <section
        className="relative w-full overflow-hidden bg-gradient-to-br from-[#002855] via-[#003476] to-[#004a8f] px-4 py-16 text-white sm:px-6 sm:py-24"
        style={{ minHeight: "min(50vh, 400px)" }}
      >
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">Γεια σας, είμαι ο Κώστας Καραγκούνης</h1>
          <p className="mt-3 text-base text-white/90 sm:text-lg">Βουλευτής Νέας Δημοκρατίας - Αιτωλοακαρνανία</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/portal/requests/new"
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-bold shadow-md transition hover:opacity-95"
              style={{ background: GOLD, color: "#0f172a" }}
            >
              Υποβολή αιτήματος
            </Link>
            <Link
              href="/portal/news"
              className="inline-flex items-center justify-center rounded-xl border-2 border-white/90 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Μάθετε περισσότερα
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-center text-xl font-bold" style={{ color: ND }}>
          Η πύλη σας προς το γραφείο
        </h2>
        <p className="mx-auto mt-1 max-w-2xl text-center text-sm text-slate-600">
          Υποβάλλετε αιτήματα, παρακολουθήτε την πορεία τους και ενημερώνεστε για τη δημόσια δραστηριότητα.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "Υποβάλετε αίτημα",
              d: "Περιγράψτε άμεσα το ζήτημά σας. Το παραλαμβάνουμε εξατομικευμένα.",
              Icon: Send,
            },
            {
              t: "Παρακολουθήστε την πορεία",
              d: "Όλα τα αιτήματά σας και η κατάστασή τους, σε μία ασφαλή επισκόπηση.",
              Icon: LineChart,
            },
            {
              t: "Ενημερωθείτε",
              d: "Δημόσια άρθρα και ανακοινώσεις, χωρίς περιττό «θόρυβο».",
              Icon: Bell,
            },
          ].map(({ t, d, Icon }) => (
            <div
              key={t}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-white"
                style={{ background: ND }}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="text-base font-bold text-slate-900">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {list.length > 0 && (
        <section className="bg-slate-50 py-12 sm:py-16" id="nea">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-xl font-bold" style={{ color: ND }}>
              Πρόσφατα νέα
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {list.map((p) => (
                <Link
                  key={p.id}
                  href={`/portal/news/${p.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div
                    className="aspect-[16/9] w-full overflow-hidden bg-slate-200"
                    style={p.cover_image ? { backgroundImage: `url(${p.cover_image})`, backgroundSize: "cover" } : undefined}
                  />
                  <div className="flex flex-1 flex-col p-4">
                    <span
                      className="inline w-fit rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: "#e8f0f9", color: ND }}
                    >
                      {p.category}
                    </span>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold text-slate-900 group-hover:underline">
                      {p.title}
                    </h3>
                    {p.excerpt && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{p.excerpt}</p>}
                  </div>
                </Link>
              ))}
            </div>
            <p className="mt-5 text-center">
              <Link href="/portal/news" className="text-sm font-bold hover:underline" style={{ color: ND }}>
                Όλα τα νεότερα →
              </Link>
            </p>
          </div>
        </section>
      )}

      <section className="border-t border-slate-200 bg-white py-10" id="epik">
        <p className="text-center text-sm text-slate-500">
          Για ραντεβού και γενικές πληροφορίες, ανοίξτε αίτημα ηλεκτρονικά{' '}
          <Link href="/portal/requests/new" className="font-bold hover:underline" style={{ color: ND }}>
            εδώ
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
