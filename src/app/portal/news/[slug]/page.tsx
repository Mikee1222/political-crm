"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

type Post = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string;
  published_at: string | null;
  created_at: string;
};

type Rel = { id: string; title: string; slug: string; excerpt: string | null; cover_image: string | null; category: string; published_at: string | null };

export default function PortalNewsArticlePage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [data, setData] = useState<{ post: Post; related: Rel[] } | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!slug) return;
    setErr("");
    const res = await fetchWithTimeout(`/api/portal/news/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      setErr("Δεν βρέθηκε");
      return;
    }
    setData(await res.json() as { post: Post; related: Rel[] });
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) {
    return <p className="p-6 text-red-600">{err}</p>;
  }
  if (!data) {
    return <p className="p-6 text-slate-500">Φόρτωση…</p>;
  }

  const p = data.post;
  const date = p.published_at ? new Date(p.published_at) : new Date(p.created_at);

  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <p>
        <Link href="/portal/news" className="text-sm font-medium" style={{ color: ND }}>
          ← Όλα τα νεότερα
        </Link>
      </p>
      <div className="text-center">
        <span
          className="inline rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ background: "#e8f0f9", color: ND }}
        >
          {p.category}
        </span>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{p.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {date.toLocaleString("el-GR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>
      {p.cover_image && (
        <div
          className="aspect-[21/9] w-full max-h-80 overflow-hidden rounded-2xl bg-slate-200"
          style={{ backgroundImage: `url(${p.cover_image})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
      )}
      <div className="prose prose-slate max-w-none text-slate-800">
        <ReactMarkdown>{p.content}</ReactMarkdown>
      </div>
      {data.related.length > 0 && (
        <section>
          <h2 className="text-lg font-bold" style={{ color: ND }}>Σχετικά</h2>
          <ul className="mt-2 space-y-1">
            {data.related.map((o) => (
              <li key={o.id}>
                <Link href={`/portal/news/${o.slug}`} className="text-sm font-semibold hover:underline" style={{ color: ND }}>
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
