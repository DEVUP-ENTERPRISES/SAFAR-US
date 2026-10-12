'use client';

import { useSecureUrl } from './secure-url';

/**
 * Renders a document image. For PRIVATE keys (KYC, licence, insurance, claim) it
 * exchanges the durable URL for a short-lived, authorized presigned GET - so a
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
  const { src, loading, denied } = useSecureUrl(url);

  if (loading) {
    return <span className={className} style={{ display: 'inline-block', background: 'hsl(var(--muted))' }} />;
  }
  if (denied) {
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
