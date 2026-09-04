import { config } from '../../config';

/**
 * Rewriting stored media URLs to the host we are actually running on.
 *
 * Media URLs are built at UPLOAD time and stored whole, so a photo uploaded
 * while the API was on localhost:8080 keeps that address forever. Move the API
 * to a real domain, or open the app on a phone, and every one of those photos
 * 404s — the images are fine, the addresses are stale.
 *
 * Rewriting on the way out fixes every existing row without a migration and
 * without touching what is stored, so nothing is lost if this is reverted.
 *
 * Only our own /media/view links are touched. A CDN URL or an external image is
 * left exactly as it is.
 */

const MARKER = '/media/view?key=';

/** Cheap guard so the common case costs one substring check. */
export function looksLikeStoredMedia(s: string): boolean {
  return s.includes(MARKER);
}

export function rewriteMediaUrl(url: string): string {
  const at = url.indexOf(MARKER);
  if (at === -1) return url;
  // Keep everything from the marker on; replace whatever host preceded it.
  return `${config.app.publicUrl}${url.slice(at)}`;
}

/**
 * Walk a response payload and rewrite any stored media URL in it.
 *
 * Depth-limited and cycle-safe: a response body is a tree in practice, but a
 * hand-built object with a self-reference must not hang the request.
 */
export function normaliseMediaUrls<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > 8 || value == null) return value;

  if (typeof value === 'string') {
    return (looksLikeStoredMedia(value) ? rewriteMediaUrl(value) : value) as unknown as T;
  }

  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = normaliseMediaUrls(value[i], depth + 1, seen);
    }
    return value;
  }

  // Dates, ObjectIds and Buffers are objects but have no URLs inside them, and
  // walking them would be pure cost.
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  for (const k of Object.keys(value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[k];
    if (typeof v === 'string') {
      if (looksLikeStoredMedia(v)) (value as Record<string, unknown>)[k] = rewriteMediaUrl(v);
    } else if (v && typeof v === 'object') {
      (value as Record<string, unknown>)[k] = normaliseMediaUrls(v, depth + 1, seen);
    }
  }
  return value;
}
