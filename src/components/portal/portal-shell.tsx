"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Facebook, Instagram, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { portalDisplayFirstName } from "@/lib/portal-display";

const ND = "#003476";

function isAuthPage(path: string) {
  return path === "/portal/login" || path === "/portal/register";
}

function PortalHeader({
  signedIn,
  firstName,
  mobileOpen,
  setMobileOpen,
}: {
  signedIn: boolean;
  firstName: string | null;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const pathname = usePathname() ?? "";

  const nav = [
    { href: "/portal", label: "Αρχική" },
    { href: "/portal/requests", label: "Αιτήματα" },
    { href: "/portal/news", label: "Νέα" },
    { href: "/portal#portal-footer-contact", label: "Επικοινωνία" },
  ];

  const isActive = (href: string) => {
    if (href === "/portal") {
      return pathname === "/portal";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <header
      className="sticky top-0 z-50 border-b-2 border-[#C9A84C] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex h-[72px] min-h-[72px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/portal"
          className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3"
          onClick={() => setMobileOpen(false)}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-[#0f172a]"
            style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
          >
            ΚΚ
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[16px] font-bold leading-tight" style={{ color: ND }}>
              Κώστας Καραγκούνης
            </span>
            <span
              className="mt-0.5 block text-[12px] font-medium uppercase tracking-[0.06em] text-[#64748B]"
            >
              Βουλευτής Αιτωλοακαρνανίας
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Κύρια">
          {nav.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={[
                "rounded-lg px-3.5 py-2 text-sm font-semibold transition",
                isActive(i.href) ? "text-white shadow-sm" : "text-[#64748B] hover:bg-slate-100",
              ].join(" ")}
              style={isActive(i.href) ? { background: ND } : undefined}
            >
              {i.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {signedIn && firstName && (
            <span className="hidden max-w-[8rem] truncate text-sm text-[#64748B] lg:inline">
              Γεια, {firstName}
            </span>
          )}
          {signedIn ? (
            <SignOutButton />
          ) : isAuthPage(pathname) ? null : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/portal/login"
                className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-bold text-[#003476] shadow-sm transition hover:bg-slate-50"
              >
                Είσοδος
              </Link>
              <Link
                href="/portal/register"
                className="rounded-lg px-3.5 py-2 text-sm font-bold text-[#0f172a] shadow-sm transition"
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              >
                Εγγραφή
              </Link>
            </div>
          )}
          {!isAuthPage(pathname) && (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[#1A1A2E] md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Κλείσιμο μενού" : "Μενού"}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          )}
        </div>
      </div>

      {mobileOpen && !isAuthPage(pathname) && (
        <div className="border-t border-[#E2E8F0] bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Κινητό">
            {nav.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={[
                  "rounded-lg px-3 py-2.5 text-sm font-bold",
                  isActive(i.href) ? "text-white" : "text-[#1A1A2E]",
                ].join(" ")}
                style={isActive(i.href) ? { background: ND } : undefined}
                onClick={() => setMobileOpen(false)}
              >
                {i.label}
              </Link>
            ))}
            {!signedIn && (
              <div className="mt-3 flex flex-col gap-2 border-t border-[#E2E8F0] pt-3">
                <Link
                  href="/portal/login"
                  className="text-center text-sm font-bold text-[#003476]"
                  onClick={() => setMobileOpen(false)}
                >
                  Είσοδος
                </Link>
                <Link
                  href="/portal/register"
                  className="rounded-lg py-2.5 text-center text-sm font-bold text-[#0f172a]"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
                  onClick={() => setMobileOpen(false)}
                >
                  Εγγραφή
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="shrink-0 rounded-lg border border-[#C9A84C]/50 bg-gradient-to-b from-[#C9A84C] to-[#8B6914] px-2.5 py-2 text-xs font-bold text-[#0f172a] shadow-sm sm:px-3 sm:text-sm"
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
    <footer
      className="mt-auto border-t border-[#1e293b] bg-[#0A0F1A] text-slate-300"
      id="portal-footer-contact"
    >
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#C9A84C] to-transparent" aria-hidden />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold text-[#0f172a]"
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              >
                ΚΚ
              </span>
              <span className="font-bold text-white">Κώστας Καραγκούνης</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-400">
              Υφυπουργός Εργασίας &amp; Κοινωνικής Ασφάλισης — Βουλευτής Αιτωλοακαρνανίας. Η πύλη για αιτήματα, ενημέρωση και
              επικοινωνία.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#C9A84C]">Πλοήγηση</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { href: "/portal", t: "Αρχική" },
                { href: "/portal/requests", t: "Αιτήματα" },
                { href: "/portal/news", t: "Νέα" },
                { href: "/portal#portal-footer-contact", t: "Επικοινωνία" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-slate-300 transition hover:text-white">
                    {l.t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#C9A84C]">Κοινωνικά</h3>
            <ul className="mt-3 flex flex-wrap gap-3">
              <a
                href="https://www.facebook.com"
                className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                <Facebook className="h-4 w-4" /> Facebook
              </a>
              <a
                href="https://www.instagram.com"
                className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                <Instagram className="h-4 w-4" /> Instagram
              </a>
              <a
                href="https://x.com"
                className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                <span className="font-bold">𝕏</span> (Twitter)
              </a>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#C9A84C]">Επαφή</h3>
            <p className="mt-3 text-sm text-slate-400">
              Γραφείο βουλευτή, Αιτωλοακαρνανία
            </p>
            <a href="tel:+3026410" className="mt-2 block text-sm font-medium text-[#C9A84C]">
              +30 2641 0 — Γραμματεία
            </a>
          </div>
        </div>
        <p className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Κώστας Καραγκούνης. Όλα τα δικαιώματα.
        </p>
      </div>
    </footer>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [me, setMe] = useState<{ first: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isAuthPage(pathname)) {
      setMe(null);
      return;
    }
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMe(null);
        return;
      }
      const res = await fetchWithTimeout("/api/portal/me", { credentials: "same-origin" });
      if (!res.ok) {
        setMe(null);
        return;
      }
      const j = (await res.json()) as { portal: { first_name: string; last_name: string } };
      setMe({ first: portalDisplayFirstName(j.portal) });
    })();
  }, [pathname]);

  const noChrome =
    pathname.startsWith("/portal/login") || pathname.startsWith("/portal/register");

  if (noChrome) {
    return (
      <div className="flex min-h-[-webkit-fill-available] min-h-dvh flex-col bg-[#FAFBFC] text-[#1A1A2E] antialiased">
        {children}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[-webkit-fill-available] min-h-dvh min-w-0 flex-col bg-[#FAFBFC] text-[#1A1A2E] antialiased [color-scheme:light]"
      data-theme="light"
    >
      <PortalHeader
        signedIn={Boolean(me)}
        firstName={me?.first ?? null}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className="min-h-0 min-w-0 flex-1 bg-[#FAFBFC]">{children}</div>
      <PortalFooter />
    </div>
  );
}
