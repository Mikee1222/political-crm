import { NextResponse, type NextRequest } from "next/server";
import { redirectWithSession, updateSession } from "@/lib/supabase/middleware";

const CALLER_BLOCKED_PREFIXES = [
  "/dashboard",
  "/campaigns",
  "/tasks",
  "/requests",
  "/schedule",
  "/api/schedule",
  "/api/data-tools",
  "/data-tools",
  "/settings",
] as const;

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/public/")) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico" ||
    /^\/icon(-\d+)?\.(png|svg)$/.test(pathname) ||
    pathname === "/icon.svg"
  ) {
    return NextResponse.next();
  }

  const { supabase, response: sessionResponse, user: authUser } = await updateSession(request);
  const isLoggedIn = Boolean(authUser);
  const isLoginPage = pathname === "/login";
  const isRetellPublic = pathname.startsWith("/api/retell/webhook") || pathname === "/api/retell/llm";

  if (!isLoggedIn && !isLoginPage && !isRetellPublic) {
    return redirectWithSession(request, "/login", sessionResponse);
  }
  if (isLoggedIn && isLoginPage) {
    await supabase
      .from("profiles")
      .select("role")
      .eq("id", authUser!.id)
      .maybeSingle();
    return redirectWithSession(request, "/dashboard", sessionResponse);
  }

  if (isLoggedIn && !isLoginPage && !isRetellPublic) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authUser!.id)
      .maybeSingle();
    const role = (prof?.role as string) ?? "caller";

    if (role === "caller") {
      for (const p of CALLER_BLOCKED_PREFIXES) {
        if (pathname === p || pathname.startsWith(`${p}/`)) {
          return redirectWithSession(request, "/contacts", sessionResponse);
        }
      }
    }
    if (role === "manager" && (pathname === "/settings" || pathname.startsWith("/settings/"))) {
      return redirectWithSession(request, "/dashboard", sessionResponse);
    }
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
