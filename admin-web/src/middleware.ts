import { NextResponse, type NextRequest } from 'next/server';

/**
 * The console is reachable only under a secret slug.
 *
 * The admin app's pages live at the root of its route tree (`/login`,
 * `/users`, …), but none of those paths are served directly. A request must
 * arrive as `/{SLUG}/...` — the slug is stripped and the request is rewritten
 * to the real route internally, so the URL bar keeps the slug and the routing
 * never exposes a slug-less path.
 *
 * Everything NOT under the slug — `/login`, `/users`, `/`, a random probe —
 * returns a bare 404, identical to any missing page. So even someone who
 * reaches port 3005 (past the network controls in docs/ADMIN-ISOLATION.md)
 * finds nothing to log into without already knowing the slug.
 *
 * This is obscurity layered on top of real controls, not instead of them:
 * every admin API call is still gated by requireAdmin server-side, the app
 * sits behind Cloudflare Access, and the process binds to loopback. The slug
 * keeps the login page itself out of reach of anyone who has none of the
 * above — which is exactly the "nobody should even find it" requirement.
 */
const SLUG = process.env.NEXT_PUBLIC_ADMIN_SLUG || '';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // A missing slug is a misconfiguration, not a reason to serve the console
  // wide open. Fail closed.
  if (!SLUG || SLUG === 'change-me-to-a-long-random-slug') {
    return new NextResponse(null, { status: 404 });
  }

  // Under the slug → strip it and serve the real route (internal rewrite).
  if (pathname === `/${SLUG}` || pathname.startsWith(`/${SLUG}/`)) {
    // slice past `/{SLUG}`, leaving '' for the bare slug or '/login', '/users/…'
    const rest = pathname.slice(SLUG.length + 1);
    const url = req.nextUrl.clone();
    // `rest` already carries its own leading slash, so don't add another.
    url.pathname = rest || '/';
    url.search = search;
    return NextResponse.rewrite(url);
  }

  // Anything else reveals nothing.
  return new NextResponse(null, { status: 404 });
}

export const config = {
  // Page routes only. Static assets and the framework's own paths are skipped,
  // or the app cannot load its own JS/CSS behind the slug.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
