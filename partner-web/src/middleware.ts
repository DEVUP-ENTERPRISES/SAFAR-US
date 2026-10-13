import { NextResponse, type NextRequest } from 'next/server';

// House Fleet's own subdomain is served by this site and opens on the host area.
const HF_HOST = process.env.NEXT_PUBLIC_HOUSE_FLEET_HOST || '';

export function middleware(req: NextRequest) {
  if (HF_HOST && req.nextUrl.hostname === HF_HOST && req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/host';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
