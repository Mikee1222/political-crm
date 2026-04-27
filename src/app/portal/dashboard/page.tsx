"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";
const GOLD = "#C9A84C";

function base64ToUint8(b64: string): BufferSource {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buf[i] = raw.charCodeAt(i);
  }
  return buf;
}

type Req = {
  id: string;
  request_code: string | null;
  title: string;
  status: string | null;
  created_at: string | null;
  category: string | null;
};

type PortalMe = { first_name: string; last_name: string; verified?: boolean };

type Post = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  published_at: string | null;
};

function statusBadge(s: string) {
  const c =
    s === "Ολοκληρώθηκε"
      ? "bg-emerald-100 text-emerald-900"
      : s === "Σε εξέλιξη"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-200 text-slate-800";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{s || "Νέο"}</span>;
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [portalRow, setPortalRow] = useState<PortalMe | null>(null);
  const [requests, setRequests] = useState<Req[] | null>(null);
  const [news, setNews] = useState<Post[] | null>(null);
  const [err, setErr] = useState("");
  const pushTried = useRef(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [mRes, rRes, nRes] = await Promise.all([
        fetchWithTimeout("/api/portal/me", { credentials: "same-origin" }),
        fetchWithTimeout("/api/portal/requests", { credentials: "same-origin" }),
        fetchWithTimeout("/api/portal/news?limit=3", { credentials: "same-origin" }),
      ]);
      if (mRes.status === 401) {
        router.replace("/portal/login?next=/portal/dashboard");
        return;
      }
      if (!mRes.ok) {
        setErr("Δεν φορτώθηκε το προφίλ");
        return;
      }
      const m = (await mRes.json()) as { portal: PortalMe };
      setPortalRow(m.portal ?? null);
      setName(m.portal?.first_name ?? "Πολίτη");
      if (rRes.ok) {
        const rj = (await rRes.json()) as { requests: Req[] };
        setRequests(rj.requests ?? []);
      } else {
        setRequests([]);
      }
      if (nRes.ok) {
        const nj = (await nRes.json()) as { posts: Post[] };
        setNews(nj.posts ?? []);
      } else {
        setNews([]);
      }
    } catch {
      setErr("Σφάλμα");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pushTried.current) {
      return;
    }
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }
    if (localStorage.getItem("portal-push-asked") === "1") {
      return;
    }
    if (!portalRow) {
      return;
    }
    pushTried.current = true;
    const run = async () => {
      try {
        const pr = await fetchWithTimeout("/api/portal/vapid-public");
        const { publicKey: pub } = (await pr.json()) as { publicKey: string | null };
        if (!pub) {
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          try {
            localStorage.setItem("portal-push-asked", "1");
          } catch {
            // ignore
          }
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8(pub),
        });
        await fetchWithTimeout("/api/portal/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        try {
          localStorage.setItem("portal-push-asked", "1");
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    };
    void run();
  }, [portalRow]);

  if (err && !name && requests === null) {
    return <p className="p-6 text-sm text-red-600">{err}</p>;
  }

  const all = requests ?? [];
  const openCount = all.filter((r) => r.status === "Νέο" || r.status === "Σε εξέλιξη").length;
  const done = all.filter((r) => r.status === "Ολοκληρώθηκε").length;
  const recent = all.slice(0, 5);
  const posts = news ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      {portalRow && portalRow.verified === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Επαληθεύστε το email σας (ελέγξτε τα εισερχόμενα / spam).
        </div>
      )}
      <h1 className="text-2xl font-bold text-slate-900">Καλώς ήρθατε, {name || "—"}!</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { t: "Αιτήματά μου", n: all.length, sub: "συνολικά" },
          { t: "Σε εξέλιξη", n: openCount, sub: "Νέο + Σε εξέλιξη" },
          { t: "Ολοκληρώθηκαν", n: done, sub: "—" },
        ].map((x) => (
          <div
            key={x.t}
            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
          >
            <p className="text-xs font-bold uppercase text-slate-500">{x.t}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: ND }}>{x.n}</p>
            <p className="text-xs text-slate-500">{x.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-slate-800">Πρόσφατα αιτήματα</h2>
        <Link
          href="/portal/requests/new"
          className="inline-flex justify-center rounded-lg px-4 py-2.5 text-sm font-bold"
          style={{ background: GOLD, color: "#0f172a" }}
        >
          Νέο αίτημα
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-slate-500">Καμία καταχώριση ακόμα.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
            >
              <Link href={`/portal/requests/${r.id}`} className="min-w-0 flex-1 font-medium text-slate-900 hover:underline">
                <span className="font-mono text-xs text-slate-500">{r.request_code} · </span>
                {r.title}
              </Link>
              {statusBadge(r.status || "Νέο")}
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-lg font-bold text-slate-800">Τελευταία νέα</h2>
      {posts.length === 0 ? (
        <p className="text-sm text-slate-500">Δεν υπάρχουν δημοσιευμένα νεότερα.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/portal/news/${p.slug}`} className="text-sm font-semibold" style={{ color: ND }}>
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
