'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

const PRIVATE_PREFIXES = ['kyc/', 'registration/', 'insurance/', 'claim/'];

/** Pull the object key out of a stored URL: the pathname, minus the leading slash. */
function keyFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/^\/+/, '');
    return path || null;
  } catch {
    return null;
  }
}

function isPrivateKey(key: string | null): key is string {
  return !!key && PRIVATE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Renders a document image. For PRIVATE keys (KYC, licence, insurance, claim) it
 * exchanges the durable URL for a short-lived, authorized presigned GET — so a
 * driver's licence is never reachable by anyone who merely has the link. Public
 * assets and dev placeholders render straight through.
 */
export function SecureDoc({
  url,
  alt,
  className,
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  const key = keyFromUrl(url);
  const priv = isPrivateKey(key);

  const signed = useQuery({
    queryKey: ['secure-doc', key],
    queryFn: () => api.get<{ url: string }>('/media/download', { key: key! }),
    enabled: priv,
    // A presigned GET expires in ~2 min; refetch a bit before that.
    staleTime: 90_000,
  });

  const src = priv ? signed.data?.url : url;

  if (priv && signed.isLoading) {
    return <span className={className} style={{ display: 'inline-block', background: 'hsl(var(--muted))' }} />;
  }
  if (priv && signed.isError) {
    return (
      <span className={`grid place-items-center text-[10px] text-destructive ${className ?? ''}`}>
        no access
      </span>
    );
  }
  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt={alt ?? ''} className={className} />
    </a>
  );
}
