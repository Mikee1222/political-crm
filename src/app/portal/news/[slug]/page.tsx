"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
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

type Rel = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string;
  published_at: string | null;
};

export default function PortalNewsArticlePage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [data, setData] = useState<{ post: Post; related: Rel[] } | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!slug) {
      return;
    }
    setErr("");
    const res = await fetchWithTimeout(`/api/portal/news/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      setErr("Δεν βρέθηκε");
      return;
    }
    setData((await res.json()) as { post: Post; related: Rel[] });
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) {
    return (
      <div className="p-6">
        <p className="text-red-600">{err}</p>
        <Link href="/portal/news" className="mt-2 inline-block font-extrabold" style={{ color: ND }}>
          Νέα
        </Link>
      </div>
    );
  }
  if (!data) {
    return <p className="p-8 text-center text-[#64748B]">Φόρτωση…</p>;
  }

  const p = data.post;
  const date = p.published_at ? new Date(p.published_at) : new Date(p.created_at);

  return (
    <article className="mx-auto w-full min-w-0 max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/portal/news"
        className="inline-flex items-center gap-1 text-sm font-extrabold hover:underline"
        style={{ color: ND }}
      >
        <ChevronLeft className="h-4 w-4" />
        Όλα τα νεότερα
      </Link>
      <div className="mt-6 text-center">
        <span
          className="inline-block rounded-full px-3 py-0.5 text-xs font-extrabold text-[#0f172a]"
          style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
        >
          {p.category}
        </span>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight text-[#1A1A2E] sm:text-4xl" style={{ fontWeight: 800 }}>
          {p.title}
        </h1>
        <p className="mt-2 text-sm text-[#64748B]">
          {date.toLocaleString("el-GR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>
      {p.cover_image && (
        <div
          className="mt-8 aspect-[21/9] max-h-80 w-full overflow-hidden rounded-2xl bg-slate-200"
          style={{ backgroundImage: `url(${p.cover_image})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
      )}
      <div className="portal-prose prose prose-slate mt-8 max-w-none text-[#1A1A2E]">
        <ReactMarkdown>{p.content}</ReactMarkdown>
      </div>
      {data.related.length > 0 && (
        <section className="mt-10 border-t border-[#E2E8F0] pt-8">
          <h2 className="text-xl font-extrabold" style={{ color: ND }}>
            Σχετικά
          </h2>
          <ul className="mt-3 space-y-2">
            {data.related.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/portal/news/${o.slug}`}
                  className="text-sm font-bold hover:underline"
                  style={{ color: ND }}
                >
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
