import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

let notify: (message: string) => void = () => undefined;

export function setLinkNotifier(fn: (message: string) => void) {
  notify = fn;
}

/** Opens a phone, mail or store link; failure shows a message instead of doing nothing. */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    notify("Couldn't open that link on this phone.");
    return false;
  }
}

/** Opens a web page (legal page, signed document link) in the in-app browser. */
export async function openInAppBrowser(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  } catch {
    await openExternal(url);
  }
}

export const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://www.catodrive.com';

/** A page on the website, for features that stay web-only. */
export const webUrl = (path: string) => `${WEB_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;

export const PARTNER_ORIGIN = process.env.EXPO_PUBLIC_PARTNER_URL ?? 'https://partners.catodrive.com';
export const HOST_ORIGIN = process.env.EXPO_PUBLIC_HOST_URL ?? 'https://host.catodrive.com';

/** A page on the website that serves it: host and captain pages on the host site, the rest of the partner area on the partner site. */
export const partnerWebUrl = (path: string) => {
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${/^\/(host|captain)(\/|\?|$)/.test(rel) ? HOST_ORIGIN : PARTNER_ORIGIN}${rel}`;
};

/** Opens a partner page in the Partner app when it is installed, otherwise on the partner website. */
export async function openPartner(path: string): Promise<void> {
  try {
    await Linking.openURL(`catodrive-partner://${path.replace(/^\//, '')}`);
  } catch {
    await openInAppBrowser(partnerWebUrl(path));
  }
}

/**
 * Maps a server link (push deep link, email link) onto an app screen. Patterns
 * use the app's route syntax ("/bookings/[id]"); anything unknown opens home.
 */
export function createRouteResolver(patterns: string[], home = '/') {
  const compiled = patterns.map((p) => new RegExp(`^${p.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+')}/?$`));
  return (link: string | undefined | null): string => {
    if (!link) return home;
    let path = link;
    try {
      if (/^https?:\/\//.test(link)) {
        const u = new URL(link);
        path = `${u.pathname}${u.search}`;
      }
    } catch {
      return home;
    }
    const bare = path.split('?')[0].split('#')[0];
    return compiled.some((re) => re.test(bare)) ? path : home;
  };
}
