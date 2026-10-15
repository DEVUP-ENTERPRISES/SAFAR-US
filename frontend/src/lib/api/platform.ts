// The operations panel names itself, so the server only lets operations accounts sign in there.
const PORTAL_HEADERS: Record<string, string> = process.env.NEXT_PUBLIC_APP_SURFACE === 'ioc' ? { 'x-portal': 'ioc' } : {};

/** How the API client reaches the network; the mobile apps ship their own version of this file. */
export const platform = {
  headers: (): Record<string, string> => PORTAL_HEADERS,
  fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
};
