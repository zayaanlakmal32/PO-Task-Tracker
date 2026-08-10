import { NextRequest, NextResponse } from "next/server";
import { sha256Hex, AUTH_COOKIE_NAME } from "@/lib/auth-hash";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next(); // no password configured -> open dashboard

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const expected = await sha256Hex(password, crypto.subtle);
  const cookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (cookie === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

