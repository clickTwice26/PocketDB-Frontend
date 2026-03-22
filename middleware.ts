import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIX_PATHS = ["/login", "/register"];
const COOKIE_NAME  = "pocketdb_token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Landing page — always accessible, never redirect
  if (pathname === "/") return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const isPublic = PUBLIC_PREFIX_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated user trying to access a protected route → login
  if (!isPublic && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user visiting login/register → dashboard
  if (isPublic && token) {
    return NextResponse.redirect(new URL("/dashboard/overview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match all paths EXCEPT:
   * - /api/*  (backend proxied routes)
   * - /_next/* (Next internals)
   * - /favicon.ico, images, etc.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).+)"],
};
