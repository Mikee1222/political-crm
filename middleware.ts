import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";

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

  const response = await updateSession(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const isLoggedIn = Boolean(data.user);
  const isLoginPage = pathname === "/login";
  const isWebhook = pathname.startsWith("/api/retell/webhook");

  if (!isLoggedIn && !isLoginPage && !isWebhook) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isLoggedIn && isLoginPage) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user!.id)
      .maybeSingle();
    const role = (prof?.role as string) ?? "caller";
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isLoggedIn && !isLoginPage && !isWebhook) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user!.id)
      .maybeSingle();
    const role = (prof?.role as string) ?? "caller";

    if (role === "caller") {
      for (const p of CALLER_BLOCKED_PREFIXES) {
        if (pathname === p || pathname.startsWith(`${p}/`)) {
          return NextResponse.redirect(new URL("/contacts", request.url));
        }
      }
    }
    if (role === "manager" && (pathname === "/settings" || pathname.startsWith("/settings/"))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
