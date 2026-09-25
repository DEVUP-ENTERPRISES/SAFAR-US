import { ValidationError } from '../../core/errors/app-error';
import { parseKey } from './storage.gateway';
import { storageGateway } from './storage.provider';

/** The storage key a client refers to: sent directly, or recovered from a URL (CDN path or /media/view?key=). */
function keyOf(ref: { key?: string; url?: string }): string | undefined {
  if (ref.key) return ref.key;
  if (!ref.url) return undefined;
  try {
    const u = new URL(ref.url);
    return u.searchParams.get('key') ?? decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return undefined;
  }
}

/**
 * Trust only what the server issued: the caller's own upload of the expected category, never a
 * client-supplied URL. The stored URL is derived here from the key, so javascript:/data:/foreign
 * hosts cannot get in.
 */
export function resolveOwnedUpload(
  ref: { key?: string; url?: string },
  ownerId: string,
  category: string,
): { key: string; url: string } {
  const key = keyOf(ref);
  const parsed = key ? parseKey(key) : null;
  if (!key || !parsed || parsed.category !== category || parsed.ownerId !== ownerId) {
    throw new ValidationError('Upload the file through the app first, then attach it');
  }
  return { key, url: storageGateway.publicUrlFor(key) };
}
