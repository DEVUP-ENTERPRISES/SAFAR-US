import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/** Storage folders that are never public: identity, documents, claims and chat photos. */
const PRIVATE_PREFIXES = ['kyc/', 'registration/', 'insurance/', 'claim/', 'message/'];

/** The storage key inside a media URL (?key=… or the path). */
export function keyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.searchParams.get('key') ?? parsed.pathname.replace(/^\/+/, '');
    return path || null;
  } catch {
    return null;
  }
}

export function isPrivateKey(key: string | null): key is string {
  return !!key && PRIVATE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * A URL safe to show: public media as-is, private media through a short-lived
 * signed link that only the owner or allowed staff can get.
 */
export function useSecureUrl(url: string) {
  const key = keyFromUrl(url);
  const priv = isPrivateKey(key);
  const signed = useQuery({
    queryKey: ['secure-doc', key],
    queryFn: () => api.get<{ url: string }>('/media/download', { key: key! }),
    enabled: priv,
    staleTime: 90_000,
  });
  return { src: priv ? signed.data?.url : url, loading: priv && signed.isLoading, denied: priv && signed.isError };
}
