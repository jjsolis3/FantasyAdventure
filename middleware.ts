import { NextResponse, type NextRequest } from "next/server";

/**
 * Puts the path onto the request so server components can read it.
 *
 * App Router layouts are not told which page they are wrapping, which is
 * usually a good thing and is a problem in exactly one place: the television
 * display is a page that must wear no chrome at all, and the chrome is added by
 * the root layout, which every page shares.
 *
 * The alternatives were worse. Moving every existing page into a route group so
 * `/screen` could sit outside it is a large rename for one page's benefit, and
 * having the display cover the header with a fixed layer would leave the header
 * still rendered underneath — still asking the database who is signed in, on
 * the one device where the answer is deliberately nobody.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next's own assets and the API, none of which render the
  // layout and all of which are hot paths.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
