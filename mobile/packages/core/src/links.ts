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
