import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { openInAppBrowser, webUrl } from '@catodrive/core';
import { resolveLink } from '@/routes';

/** Opens a website path the server handed us: the app's own screen when there is one, else the website in-app. */
export function useOpenHref() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      const target = resolveLink(href);
      if (target !== '/' || href === '/') router.push(target as never);
      else void openInAppBrowser(/^https?:\/\//.test(href) ? href : webUrl(href));
    },
    [router],
  );
}
