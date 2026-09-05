import { NextResponse, type NextRequest } from 'next/server';

/**
 * The public app serves no admin console.
 *
 * The back office moved to its own application on port 3005 (see admin-web/),
 * reachable only through its own hostname behind Cloudflare Access. So on the
 * public site both the old secret slug and the literal /admin path must reveal
 * nothing — a scanner or a curious user gets the same 404 as any missing page,
 * and there is no console code in this bundle to reach even if they guessed a
 * route.
 */
const SLUG = process.env.NEXT_PUBLIC_ADMIN_SLUG || 'admin';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    (SLUG !== 'admin' && (pathname === `/${SLUG}` || pathname.startsWith(`/${SLUG}/`)))
  ) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
