import { NextResponse, type NextRequest } from "next/server";
import { redirectWithSession, updateSession } from "@/lib/supabase/middleware";
import { isPortalOnlyUser } from "@/lib/portal-user-status";

const CRM_ACCESS_COOKIE = "crm_access_granted";

const CALLER_BLOCKED_PREFIXES = [
  "/dashboard",
  "/campaigns",
  "/events",
  "/volunteers",
  "/tasks",
  "/requests",
  "/schedule",
  "/api/schedule",
  "/api/data-tools",
  "/api/events",
  "/api/volunteers",
  "/api/media",
  "/data-tools",
  "/settings",
  "/documents",
  "/content",
] as const;

function isPortalPublicPath(pathname: string) {
  if (pathname === "/portal" || pathname === "/portal/") return true;
  if (pathname === "/portal/login" || pathname === "/portal/register") return true;
  if (pathname === "/portal/news" || pathname.startsWith("/portal/news/")) return true;
  if (pathname === "/portal/about" || pathname.startsWith("/portal/about/")) return true;
  if (pathname === "/portal/appointment" || pathname.startsWith("/portal/appointment/")) return true;
  return false;
}

function isAlwaysPublicApi(pathname: string) {
  return pathname.startsWith("/api/public/");
}

function isApiPortalPublic(pathname: string) {
  if (pathname === "/api/portal/auth/register" || pathname === "/api/portal/auth/login") return true;
  if (pathname === "/api/portal/news" || pathname.startsWith("/api/portal/news/")) return true;
  if (pathname === "/api/portal/chat" || pathname === "/api/portal/voice/session") return true;
  if (pathname === "/api/portal/appointments/slots" || pathname === "/api/portal/appointments/book") {
    return true;
  }
  if (pathname === "/api/portal/social" || pathname === "/api/portal/social/tiktok") return true;
  return false;
}

function isRetellPublic(pathname: string) {
  return pathname.startsWith("/api/retell/webhook") || pathname.startsWith("/api/retell/llm");
}

function isWhatsAppPublic(pathname: string) {
  return pathname === "/api/whatsapp/webhook";
}

function isPollPublicPath(pathname: string) {
  if (pathname.startsWith("/poll/")) return true;
  if (pathname.startsWith("/api/public/polls/")) return true;
  return false;
}

const ACCESS_CODE_SKIP_PATHS = [
  "/enter-code",
  "/login",
  "/api/access-code",
  "/api/auth",
  "/portal",
  "/_next",
  "/favicon.ico",
  "/manifest.json",
  "/sw.js",
] as const;

function isAccessCodeExcluded(pathname: string) {
  return ACCESS_CODE_SKIP_PATHS.some((p) => pathname.startsWith(p));
}

type ProfileGateRow = { role?: string | null; is_portal?: boolean | null } | null;

/** Returns a redirect/JSON response if non-admin must enter access code; null if allowed. */
function enforceCrmAccessCode(
  request: NextRequest,
  profile: ProfileGateRow,
  pathname: string,
  sessionResponse: NextResponse,
): NextResponse | null {
  if (isAccessCodeExcluded(pathname)) {
    console.log("[middleware] access code check skipped (excluded path):", pathname);
    return null;
  }

  if (profile === null) {
    console.log("[middleware] profile null — treating as non-admin, checking cookie");
  }

  const isAdmin = profile?.role === "admin";
  console.log("[middleware] profile role:", profile?.role, "isAdmin:", isAdmin);

  const cookie = request.cookies.get(CRM_ACCESS_COOKIE)?.value;
  console.log("[middleware] accessGranted cookie:", cookie);

  if (!isAdmin) {
    console.log("[middleware] non-admin, cookie:", cookie);
    if (cookie !== "1") {
      console.log("[middleware] REDIRECTING to /enter-code");
      if (pathname.startsWith("/api/")) {
        return jsonWithSession(
          request,
          "Απαιτείται κλειδαριθμός πρόσβασης. Μεταβείτε στη σελίδα εισαγωγής κωδικού.",
          403,
          sessionResponse,
        );
      }
      const url = new URL("/enter-code", request.url);
      url.searchParams.set("next", pathname);
      return redirectWithSession(request, url.pathname + url.search, sessionResponse);
    }
  }

  return null;
}

function jsonWithSession(
  _request: NextRequest,
  message: string,
  status: number,
  sessionRes: NextResponse,
) {
  const r = NextResponse.json({ error: message }, { status });
  for (const c of sessionRes.cookies.getAll()) {
    r.cookies.set(c);
  }
  return r;
}

function isNextStaticOrAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname === "/offline.html" ||
    /^\/icon(-\d+)?\.(png|svg)$/.test(pathname) ||
    pathname === "/icon.svg"
  );
}

/** Browser routes under the portal app (excludes e.g. /api/portal/… which is the API namespace). */
function isPortalAppPath(pathname: string) {
  return pathname === "/portal" || pathname === "/portal/" || pathname.startsWith("/portal/");
}

const PORTAL_HOSTS = new Set(["kkaragkounis.com", "www.kkaragkounis.com"]);
const CRM_HOST = "crm.kkaragkounis.com";

function isPortalProductionHost(host: string) {
  return PORTAL_HOSTS.has(host);
}

function isCrmProductionHost(host: string) {
  return host === CRM_HOST;
}

/** Local + Vercel preview: do not apply apex/crm domain split. */
function isDevOrPreviewHost(host: string) {
  return host === "localhost" || host.startsWith("127.0.0.1") || host.endsWith(".vercel.app");
}

function portalOrigin(): string {
  return (process.env.NEXT_PUBLIC_PORTAL_URL || "https://kkaragkounis.com").replace(/\/$/, "");
}

function portalDashboardRedirectUrl(): URL {
  return new URL("/portal/dashboard", portalOrigin());
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const host = hostname.split(":")[0]?.toLowerCase() ?? "";
  const pathname = request.nextUrl.pathname;

  // Production domain split (same Vercel deployment, two hostnames):
  // - kkaragkounis.com / www → portal only: /portal/*, portal APIs, static
  // - crm.kkaragkounis.com → CRM only: block browser /portal/* (send to public portal origin)
  if (!isDevOrPreviewHost(host)) {
    if (isPortalProductionHost(host)) {
      const portalDomainAllowed =
        isNextStaticOrAsset(pathname) ||
        pathname === "/portal" ||
        pathname === "/portal/" ||
        pathname.startsWith("/portal/") ||
        pathname.startsWith("/api/portal/") ||
        pathname.startsWith("/api/public/") ||
        pathname.startsWith("/_next/") ||
        pathname === "/favicon.ico" ||
        pathname === "/hero-karagkounis.png" ||
        pathname === "/viografiko2-682x1024.jpg";
      if (!portalDomainAllowed) {
        const u = request.nextUrl.clone();
        u.pathname = "/portal";
        u.search = "";
        return NextResponse.redirect(u);
      }
    } else if (isCrmProductionHost(host)) {
      if (pathname === "/portal" || pathname === "/portal/" || pathname.startsWith("/portal/")) {
        const dest = new URL(pathname + request.nextUrl.search, `${portalOrigin()}/`);
        return NextResponse.redirect(dest);
      }
    }
  }

  if (
    isNextStaticOrAsset(pathname) ||
    isAlwaysPublicApi(pathname) ||
    isRetellPublic(pathname) ||
    isWhatsAppPublic(pathname) ||
    isPollPublicPath(pathname)
  ) {
    return NextResponse.next();
  }

  const { supabase, response: sessionResponse, user: authUser } = await updateSession(request);
  const isLoggedIn = Boolean(authUser);
  const isCrmLoginPage = pathname === "/login";

  console.log("[middleware] user:", authUser?.id, "path:", pathname);

  if (!isLoggedIn) {
    if (isCrmLoginPage) return sessionResponse;
    if (isPortalPublicPath(pathname)) return sessionResponse;
    if (isPollPublicPath(pathname) && !pathname.startsWith("/api/")) {
      return sessionResponse;
    }
    if (pathname.startsWith("/api/")) {
      if (
        isApiPortalPublic(pathname) ||
        isAlwaysPublicApi(pathname) ||
        isRetellPublic(pathname) ||
        isWhatsAppPublic(pathname) ||
        (isPollPublicPath(pathname) && pathname.startsWith("/api/public/"))
      ) {
        return sessionResponse;
      }
      return jsonWithSession(request, "Μη εξουσιοδότηση", 401, sessionResponse);
    }
    if (pathname.startsWith("/portal/") && !isPortalPublicPath(pathname)) {
      const u = new URL("/portal/login", request.url);
      u.searchParams.set("next", pathname);
      return redirectWithSession(request, u.pathname + u.search, sessionResponse);
    }
    if (!pathname.startsWith("/portal/")) {
      return redirectWithSession(request, "/login", sessionResponse);
    }
  }

  let isPortalUser = false;
  let role: string = "caller";
  let profileRow: ProfileGateRow = null;
  if (isLoggedIn && authUser) {
    let portalFromService = false;
    let serviceResolved = false;
    try {
      portalFromService = await isPortalOnlyUser(authUser.id);
      serviceResolved = true;
    } catch (e) {
      console.error("[middleware] isPortalOnlyUser (service role) failed; falling back to RLS profile", e);
    }
    const { data: pRow, error: profileErr } = await supabase
      .from("profiles")
      .select("is_portal, role")
      .eq("id", authUser.id)
      .maybeSingle();
    profileRow = pRow as ProfileGateRow;
    if (profileErr) {
      console.log("[middleware] profile query error:", profileErr.message);
    }
    role = (pRow?.role as string) ?? "caller";
    isPortalUser = serviceResolved
      ? portalFromService
      : Boolean((pRow as { is_portal?: boolean } | null)?.is_portal);
    console.log(
      "[middleware] profile role:",
      pRow?.role,
      "isAdmin:",
      pRow?.role === "admin",
      "isPortalUser:",
      isPortalUser,
    );
  }

  if (isLoggedIn && authUser) {
    if (isCrmLoginPage) {
      if (isPortalUser) {
        return NextResponse.redirect(portalDashboardRedirectUrl());
      }
      const gate = enforceCrmAccessCode(request, profileRow, "/dashboard", sessionResponse);
      if (gate) return gate;
      return redirectWithSession(request, "/dashboard", sessionResponse);
    }
    if (isPortalUser && (pathname === "/portal/login" || pathname === "/portal/register")) {
      return redirectWithSession(request, "/portal/dashboard", sessionResponse);
    }
    if (!isPortalUser && (pathname === "/portal/login" || pathname === "/portal/register")) {
      return redirectWithSession(request, "/dashboard", sessionResponse);
    }
    if (!isPortalUser && (pathname === "/portal" || pathname === "/portal/" || pathname.startsWith("/portal/"))) {
      return redirectWithSession(request, "/dashboard", sessionResponse);
    }

    if (pathname.startsWith("/api/")) {
      if (isAlwaysPublicApi(pathname) || isRetellPublic(pathname) || isApiPortalPublic(pathname)) {
        return sessionResponse;
      }
      if (isPortalUser) {
        if (pathname.startsWith("/api/portal") || pathname.startsWith("/api/public")) {
          return sessionResponse;
        }
        return jsonWithSession(request, "Η πρόσβαση στο CRM δεν επιτρέπεται", 403, sessionResponse);
      }
      if (pathname.startsWith("/api/portal/") && !isApiPortalPublic(pathname)) {
        return jsonWithSession(request, "Μόνο πολίτες πύλης", 403, sessionResponse);
      }
    }

    if (isPortalUser) {
      // Block all non-portal app routes (/dashboard, /, /contacts, etc.); /api/CRM 403 above.
      const blockedCrmPages =
        pathname === "/" ||
        pathname === "/login" ||
        pathname === "/dashboard" ||
        pathname === "/contacts" ||
        pathname === "/requests" ||
        pathname === "/campaigns" ||
        pathname === "/tasks" ||
        pathname === "/settings" ||
        pathname === "/analytics" ||
        pathname === "/events" ||
        pathname === "/volunteers" ||
        pathname === "/documents" ||
        pathname === "/content" ||
        pathname === "/polls" ||
        pathname === "/schedule" ||
        pathname === "/namedays" ||
        pathname === "/heatmap" ||
        pathname === "/alexandra" ||
        pathname.startsWith("/dashboard/") ||
        pathname.startsWith("/contacts/") ||
        pathname.startsWith("/requests/") ||
        pathname.startsWith("/campaigns/") ||
        pathname.startsWith("/tasks/") ||
        pathname.startsWith("/settings/") ||
        pathname.startsWith("/analytics/") ||
        pathname.startsWith("/events/") ||
        pathname.startsWith("/volunteers/") ||
        pathname.startsWith("/documents/") ||
        pathname.startsWith("/content/") ||
        pathname.startsWith("/polls/") ||
        pathname.startsWith("/schedule/") ||
        pathname.startsWith("/namedays/") ||
        pathname.startsWith("/heatmap/") ||
        pathname.startsWith("/alexandra/");
      if (blockedCrmPages) {
        return NextResponse.redirect(portalDashboardRedirectUrl());
      }
      if (isPortalAppPath(pathname)) {
        // ok
      } else if (isNextStaticOrAsset(pathname)) {
        // ok
      } else if (pathname.startsWith("/api/")) {
        // handled
      } else {
        return NextResponse.redirect(portalDashboardRedirectUrl());
      }
    }
  }

  if (isLoggedIn && authUser && !isPortalUser && !isPortalAppPath(pathname)) {
    const gate = enforceCrmAccessCode(request, profileRow, pathname, sessionResponse);
    if (gate) return gate;
  } else if (isLoggedIn && authUser) {
    console.log(
      "[middleware] access gate skipped:",
      "isPortalUser=",
      isPortalUser,
      "isPortalAppPath=",
      isPortalAppPath(pathname),
    );
  }

  if (isLoggedIn && !isCrmLoginPage && !isRetellPublic(pathname) && !isPortalUser) {
    let navTier: "caller" | "manager" | "admin" =
      role === "admin" ? "admin" : role === "manager" ? "manager" : "caller";
    try {
      const { data: tierRow } = await supabase.from("roles").select("access_tier").eq("name", role).maybeSingle();
      const t = (tierRow as { access_tier?: string } | null)?.access_tier;
      if (t === "admin" || t === "manager" || t === "caller") navTier = t;
    } catch {
      /* roles table may not exist before migration */
    }
    if (navTier === "caller") {
      for (const p of CALLER_BLOCKED_PREFIXES) {
        if (pathname === p || pathname.startsWith(`${p}/`)) {
          return redirectWithSession(request, "/contacts", sessionResponse);
        }
      }
    }
  }

  return sessionResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)"],
};
