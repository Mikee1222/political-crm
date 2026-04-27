"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronRight, Inbox, Sparkles, TrendingUp } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { portalDisplayFirstName } from "@/lib/portal-display";

const ND = "#003476";

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

function statusBadge(s: string) {
  const c =
    s === "Ολοκληρώθηκε"
      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
      : s === "Σε εξέλιξη"
        ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
        : s === "Απορρίφθηκε"
          ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200"
          : "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{s || "Νέο"}</span>;
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [greeting, setGreeting] = useState("Πολίτη");
  const [portalRow, setPortalRow] = useState<PortalMe | null>(null);
  const [nowStr, setNowStr] = useState("");
  const [requests, setRequests] = useState<Req[] | null>(null);
  const [err, setErr] = useState("");
  const pushTried = useRef(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [mRes, rRes] = await Promise.all([
        fetchWithTimeout("/api/portal/me", { credentials: "same-origin" }),
        fetchWithTimeout("/api/portal/requests", { credentials: "same-origin" }),
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
      setGreeting(portalDisplayFirstName(m.portal));
      if (rRes.ok) {
        const rj = (await rRes.json()) as { requests: Req[] };
        setRequests(rj.requests ?? []);
      } else {
        setRequests([]);
      }
    } catch {
      setErr("Σφάλμα");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = () =>
      setNowStr(
        new Date().toLocaleString("el-GR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    t();
    const id = window.setInterval(t, 60_000);
    return () => clearInterval(id);
  }, []);

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

  if (err && requests === null) {
    return <p className="p-6 text-sm text-red-600">{err}</p>;
  }

  const all = requests ?? [];
  const openCount = all.filter((r) => r.status === "Νέο" || r.status === "Σε εξέλιξη").length;
  const done = all.filter((r) => r.status === "Ολοκληρώθηκε").length;
  const recent = all.slice(0, 5);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      {portalRow && portalRow.verified === false && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium"
          style={{ color: "#92400e" }}
        >
          Επαληθεύστε το email σας (ελέγξτε τα εισερχόμενα / spam).
        </div>
      )}

      <div
        className="overflow-hidden rounded-2xl p-6 text-white shadow-xl sm:p-8"
        style={{ background: "linear-gradient(135deg, #003476 0%, #001a3d 100%)" }}
      >
        <p className="text-sm font-medium text-white/70">Πύλη πολιτών</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Καλώς ήρθατε, {greeting}!
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-white/80">
          <Calendar className="h-4 w-4" />
          {nowStr}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            t: "Αιτήματά μου",
            n: all.length,
            sub: "συνολικά",
            icon: Inbox,
            c: ND,
          },
          {
            t: "Σε εξέλιξη",
            n: openCount,
            sub: "Νέο + Σε εξέλιξη",
            icon: TrendingUp,
            c: "#1e5fa8",
          },
          {
            t: "Ολοκληρώθηκαν",
            n: done,
            sub: "—",
            icon: Sparkles,
            c: "#059669",
          },
        ].map((x) => (
          <div
            key={x.t}
            className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">{x.t}</p>
              <x.icon className="h-4 w-4" style={{ color: x.c }} />
            </div>
            <p className="mt-2 text-3xl font-extrabold tabular-nums" style={{ color: x.c }}>
              {x.n}
            </p>
            <p className="text-xs text-[#64748B]">{x.sub}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-xl font-extrabold" style={{ color: ND }}>
          Πρόσφατη δραστηριότητα
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white px-6 py-8 text-center text-sm text-[#64748B]">
            <Inbox className="mx-auto h-10 w-10 text-[#94A3B8]" />
            <p className="mt-3 text-[#1A1A2E]">Δεν υπάρχει πρόσφατη δραστηριότητα.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/portal/requests/${r.id}`}
                  className="group flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <span
                    className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                    style={{
                      background:
                        r.status === "Ολοκληρώθηκε" ? "#059669" : r.status === "Σε εξέλιξη" ? "#1e5fa8" : "#C9A84C",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.request_code && (
                        <span
                          className="rounded-full px-2 py-0.5 font-mono text-[11px] font-bold text-[#0f172a]"
                          style={{ background: "linear-gradient(135deg, #C9A84C40, #8B691430)" }}
                        >
                          {r.request_code}
                        </span>
                      )}
                      {statusBadge(r.status || "Νέο")}
                    </div>
                    <p className="mt-1 font-bold text-[#1A1A2E] group-hover:underline">{r.title}</p>
                    <p className="text-xs text-[#64748B]">
                      {r.created_at ? new Date(r.created_at).toLocaleString("el-GR") : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#94A3B8] transition group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
