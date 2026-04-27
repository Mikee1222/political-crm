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
    return <p className="p-6 text-slate-500">Φόρτωση…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold" style={{ color: ND }}>
        Νέα & ανακοινώσεις
      </h1>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/portal/news"
          className={`rounded-full px-3 py-1 text-sm font-bold ${!catQ ? "text-white" : "bg-slate-200 text-slate-700"}`}
          style={!catQ ? { background: ND } : undefined}
        >
          Όλες
        </Link>
        {cats.map((c) => (
          <Link
            key={c}
            href={`/portal/news?category=${encodeURIComponent(c)}`}
            className="rounded-full px-3 py-1 text-sm font-bold"
            style={
              catQ === c
                ? { background: ND, color: "white" }
                : { background: "#e8f0f9", color: ND }
            }
          >
            {c}
          </Link>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {posts.map((p) => (
          <Link
            key={p.id}
            href={`/portal/news/${p.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
          >
            {p.cover_image && (
              <div
                className="aspect-[16/9] w-full bg-slate-200"
                style={{ backgroundImage: `url(${p.cover_image})`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            )}
            <div className="flex flex-1 flex-col p-4">
              <span
                className="inline w-fit rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "#e8f0f9", color: ND }}
              >
                {p.category}
              </span>
              <h2 className="mt-2 line-clamp-2 text-base font-bold text-slate-900 group-hover:underline">
                {p.title}
              </h2>
              {p.excerpt && <p className="mt-1 line-clamp-3 text-sm text-slate-600">{p.excerpt}</p>}
              <p className="mt-2 text-xs text-slate-500">
                {(p.published_at && new Date(p.published_at).toLocaleDateString("el-GR")) ||
                  new Date(p.created_at).toLocaleDateString("el-GR")}
              </p>
              <span className="mt-3 text-sm font-bold" style={{ color: ND }}>
                Διαβάστε περισσότερα →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function PortalNewsListPage() {
  return (
    <Suspense
      fallback={<p className="p-6 text-slate-500">Φόρτωση…</p>}
    >
      <PortalNewsListInner />
    </Suspense>
  );
}
