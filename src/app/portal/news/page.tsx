"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string;
  published_at: string | null;
  created_at: string;
};

function PortalNewsListInner() {
  const sp = useSearchParams();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const catQ = sp.get("category") ?? "";

  const load = useCallback(async (c: string) => {
    const [uAll, uFil] = await Promise.all([
      fetchWithTimeout("/api/portal/news?limit=200"),
      c ? fetchWithTimeout(`/api/portal/news?category=${encodeURIComponent(c)}&limit=50`) : null,
    ]);
    if (uAll.ok) {
      const a = (await uAll.json()) as { posts: Post[] };
      setCats([...new Set((a.posts ?? []).map((p) => p.category))].sort());
      if (uFil) {
        if (uFil.ok) {
          const f = (await uFil.json()) as { posts: Post[] };
          setPosts(f.posts ?? []);
        }
      } else {
        setPosts(a.posts ?? []);
      }
    }
  }, []);

  useEffect(() => {
    void load(catQ);
  }, [load, catQ]);

  if (posts === null) {
    return <p className="p-8 text-center text-[#64748B]">Φόρτωση…</p>;
  }

  if (posts.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Link href="/portal" className="text-sm font-extrabold" style={{ color: ND }}>
          ← Αρχική
        </Link>
        <h1 className="mt-4 text-2xl font-extrabold" style={{ color: ND }}>
          Νέα
        </h1>
        <p className="mt-4 text-[#64748B]">Δεν υπάρχουν δημοσιευμένα νεότερα.</p>
      </div>
    );
  }

  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="mb-2">
        <Link href="/portal" className="text-sm font-extrabold hover:underline" style={{ color: ND }}>
          ← Αρχική
        </Link>
      </p>
      <h1 className="text-2xl font-extrabold sm:text-3xl" style={{ color: ND, fontWeight: 800 }}>
        Νέα &amp; ανακοινώσεις
      </h1>
      <p className="mt-1 text-sm text-[#64748B]">Ενημερωθείτε για τη δημόσια δραστηριότητα</p>

      <div className="mb-6 mt-6 flex flex-wrap gap-2">
        <Link
          href="/portal/news"
          className={[
            "rounded-full px-3.5 py-1.5 text-sm font-bold",
            !catQ ? "text-white shadow" : "bg-white text-[#64748B] ring-1 ring-[#E2E8F0]",
          ].join(" ")}
          style={!catQ ? { background: ND } : undefined}
        >
          Όλες οι κατηγορίες
        </Link>
        {cats.map((c) => (
          <Link
            key={c}
            href={`/portal/news?category=${encodeURIComponent(c)}`}
            className="rounded-full px-3.5 py-1.5 text-sm font-bold"
            style={
              catQ === c
                ? { background: ND, color: "white" }
                : { background: "#E8F0F9", color: ND }
            }
          >
            {c}
          </Link>
        ))}
      </div>

      {featured && (
        <Link
          href={`/portal/news/${featured.slug}`}
          className="group relative mb-6 block min-h-[280px] overflow-hidden rounded-3xl border border-[#E2E8F0] bg-[#0a0f1a] text-white shadow-lg"
        >
          <div
            className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.02]"
            style={{
              backgroundImage: featured.cover_image
                ? `url(${featured.cover_image})`
                : undefined,
              background: !featured.cover_image
                ? "linear-gradient(135deg, #003476, #0a0f1a)"
                : undefined,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1a] via-[#0a0f1a]/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            <span
              className="inline-block rounded-full px-3 py-0.5 text-xs font-extrabold text-[#0f172a]"
              style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
            >
              {featured.category}
            </span>
            <h2 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">{featured.title}</h2>
            {featured.excerpt && <p className="mt-2 line-clamp-2 text-sm text-white/80">{featured.excerpt}</p>}
            <p className="mt-2 text-xs text-white/60">
              {(featured.published_at && new Date(featured.published_at).toLocaleDateString("el-GR")) ||
                new Date(featured.created_at).toLocaleDateString("el-GR")}
            </p>
          </div>
        </Link>
      )}

      {rest.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <Link
              key={p.id}
              href={`/portal/news/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md"
            >
              <div
                className="relative aspect-[16/10] w-full overflow-hidden"
                style={{
                  background: p.cover_image
                    ? `url(${p.cover_image}) center / cover no-repeat`
                    : "linear-gradient(135deg, #003476, #1e293b)",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <span
                  className="absolute left-2 top-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-[#0f172a]"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
                >
                  {p.category}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-2 text-lg font-bold text-[#1A1A2E] group-hover:underline">
                  {p.title}
                </h3>
                {p.excerpt && <p className="mt-1 line-clamp-2 text-sm text-[#64748B]">{p.excerpt}</p>}
                <p className="mt-auto pt-2 text-xs text-[#94A3B8]">
                  {(p.published_at && new Date(p.published_at).toLocaleDateString("el-GR")) ||
                    new Date(p.created_at).toLocaleDateString("el-GR")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {posts.length === 0 && <p className="py-12 text-center text-[#64748B]">Δεν υπάρχουν δημοσιευμένα νεότερα.</p>}
    </div>
  );
}

export default function PortalNewsListPage() {
  return (
    <Suspense
      fallback={<p className="p-8 text-center text-[#64748B]">Φόρτωση…</p>}
    >
      <PortalNewsListInner />
    </Suspense>
  );
}
