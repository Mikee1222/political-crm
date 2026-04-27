import { NextResponse, type NextRequest } from "next/server";
import { redirectWithSession, updateSession } from "@/lib/supabase/middleware";

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
  return pathname.startsWith("/api/retell/webhook") || pathname === "/api/retell/llm";
}

function isWhatsAppPublic(pathname: string) {
  return pathname === "/api/whatsapp/webhook";
}

function isPollPublicPath(pathname: string) {
  if (pathname.startsWith("/poll/")) return true;
  if (pathname.startsWith("/api/public/polls/")) return true;
  return false;
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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
  if (isLoggedIn && authUser) {
    const { data: pRow } = await supabase
      .from("profiles")
      .select("is_portal, role")
      .eq("id", authUser.id)
      .maybeSingle();
    isPortalUser = Boolean((pRow as { is_portal?: boolean } | null)?.is_portal);
    role = (pRow?.role as string) ?? "caller";
  }

  if (isLoggedIn && authUser) {
    if (isCrmLoginPage) {
      return redirectWithSession(request, isPortalUser ? "/portal/dashboard" : "/dashboard", sessionResponse);
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
        if (pathname.startsWith("/api/portal/") || pathname === "/api/profile" || pathname.startsWith("/api/profile/")) {
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
      if (isPortalAppPath(pathname)) {
        // ok
      } else if (isNextStaticOrAsset(pathname)) {
        // ok
      } else if (pathname.startsWith("/api/")) {
        // handled
      } else {
        return redirectWithSession(request, "/portal/dashboard", sessionResponse);
      }
    }
  }

  if (isLoggedIn && !isCrmLoginPage && !isRetellPublic(pathname) && !isPortalUser) {
    if (role === "caller") {
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
