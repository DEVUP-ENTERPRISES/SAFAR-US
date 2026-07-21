import { NextResponse, type NextRequest } from 'next/server';

/**
 * Serves the admin console from a secret base path.
 *
 * The pages live at `app/admin/*`, but the public URL is `/{ADMIN_SLUG}/*`
 * (e.g. `/ctrl-0986-cato-admin/users`). We rewrite rather than move the files
 * so there's one set of routes, and we 404 the literal `/admin` so the
 * guessable path reveals nothing — a scanner hitting /admin gets the same
 * response as any other missing page.
 *
 * This is obscurity, not authorisation: every admin API route is still gated
 * by RBAC server-side. It exists to keep the console out of the automated
 * scanning traffic that hammers /admin on every domain.
 */
const SLUG = process.env.NEXT_PUBLIC_ADMIN_SLUG || 'admin';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Nothing to do when the console is left on the default path.
  if (SLUG === 'admin') return NextResponse.next();

  // /{slug}/... → /admin/... (internal rewrite; the URL bar keeps the slug)
  if (pathname === `/${SLUG}` || pathname.startsWith(`/${SLUG}/`)) {
    const rest = pathname.slice(SLUG.length + 1); // '' or '/users'
    const url = req.nextUrl.clone();
    url.pathname = `/admin${rest}`;
    url.search = search;
    return NextResponse.rewrite(url);
  }

  // The real path must not be reachable, or the secret slug is pointless.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and the API proxy — this only concerns page routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
