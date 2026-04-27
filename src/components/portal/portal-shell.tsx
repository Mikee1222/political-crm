"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";
const GOLD = "#C9A84C";

function isAuthPage(path: string) {
  return path === "/portal/login" || path === "/portal/register";
}

function PortalHeader({ signedIn, firstName }: { signedIn: boolean; firstName: string | null }) {
  const pathname = usePathname();
  return (
    <header
      className="border-b border-slate-200/80 bg-white shadow-sm"
      style={{ ["--nd" as string]: ND, ["--gold" as string]: GOLD } as React.CSSProperties}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/portal" className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${GOLD} 0%, #8b6914 100%)` }}
          >
            ΚΚ
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-sm font-bold leading-tight" style={{ color: ND }}>
              Κώστας Καραγκούνης
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">
              Βουλευτής Αιτωλοακαρνανίας
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Κύρια">
          {[
            { href: "/portal", label: "Αρχική" },
            { href: "/portal/news", label: "Νέα" },
            { href: "/portal#epik", label: "Επικοινωνία" },
          ].map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                pathname === i.href
                  ? "text-white"
                  : "text-slate-600 hover:bg-slate-100",
              ].join(" ")}
              style={pathname === i.href ? { background: ND } : undefined}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn && firstName && (
            <span className="hidden text-sm text-slate-600 sm:inline">Γεια, {firstName}</span>
          )}
          {signedIn ? (
            <SignOutButton />
          ) : isAuthPage(pathname ?? "") ? null : (
            <Link
              href="/portal/login"
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm"
              style={{ background: ND }}
            >
              Είσοδος
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm sm:px-3"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/portal");
        router.refresh();
      }}
    >
      Έξοδος
    </button>
  );
}

function PortalFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50" style={{ color: "#003476" }}>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2" id="epik">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Βουλευτικό γραφείο</h3>
            <p className="mt-1 text-sm text-slate-600">Αιτωλοακαρνανία · Νέα Δημοκρατία</p>
            <a href="tel:+30" className="mt-2 block text-sm font-medium" style={{ color: "#C9A84C" }}>
              — Τηλέφωνο γραφείου
            </a>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Κανάλια</h3>
            <ul className="mt-1 flex flex-wrap gap-3 text-sm text-slate-600">
              <a href="https://www.facebook.com" className="hover:underline" target="_blank" rel="noreferrer">
                Facebook
              </a>
              <a href="https://x.com" className="hover:underline" target="_blank" rel="noreferrer">
                X
              </a>
            </ul>
          </div>
        </div>
        <p className="text-center text-xs text-slate-500">© {new Date().getFullYear()} — Κώστας Καραγκούνης. Όλα τα δικαιώματα.</p>
      </div>
    </footer>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<{ first: string } | null>(null);

  useEffect(() => {
    if (isAuthPage(pathname ?? "")) {
      setMe(null);
      return;
    }
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMe(null);
        return;
      }
      const res = await fetchWithTimeout("/api/portal/me", { credentials: "same-origin" });
      if (!res.ok) {
        setMe(null);
        return;
      }
      const j = (await res.json()) as { portal: { first_name: string } };
      setMe({ first: j.portal?.first_name ?? "" });
    })();
  }, [pathname]);

  const noChrome = (pathname?.startsWith("/portal/login") ?? false) || (pathname?.startsWith("/portal/register") ?? false);
  if (noChrome) {
    return <div className="min-h-[-webkit-fill-available] min-h-dvh flex flex-col bg-white text-slate-900">{children}</div>;
  }

  return (
    <div
      className="min-h-[-webkit-fill-available] min-h-dvh flex flex-col bg-white text-slate-900 antialiased"
      data-theme="light"
    >
      <PortalHeader signedIn={Boolean(me)} firstName={me?.first ?? null} />
      <div className="min-h-0 flex-1 bg-white">{children}</div>
      <PortalFooter />
    </div>
  );
}
