import { normaliseMediaUrls, rewriteMediaUrl, looksLikeStoredMedia } from './media-url';
import { config } from '../../config';

/**
 * This runs on every single response, so it has to be both correct and
 * incapable of hanging a request. The cycle and depth tests matter as much as
 * the rewriting ones.
 */
describe('media URL normalisation', () => {
  const base = config.app.publicUrl;
  const stale = 'http://localhost:8080/api/v1/media/view?key=vehicle_photo%2Fabc.jpg';

  it('rewrites a stale host to the current one', () => {
    expect(rewriteMediaUrl(stale)).toBe(`${base}/media/view?key=vehicle_photo%2Fabc.jpg`);
  });

  it('preserves the key exactly, including its encoding', () => {
    // A mangled key is a 404 that looks like a permissions problem.
    const out = rewriteMediaUrl(stale);
    expect(out.endsWith('key=vehicle_photo%2Fabc.jpg')).toBe(true);
  });

  it('leaves foreign URLs alone', () => {
    for (const url of [
      'https://cdn.example.com/photo.jpg',
      'https://images.unsplash.com/photo-123',
      'https://bucket.s3.amazonaws.com/x.jpg?X-Amz-Signature=abc',
    ]) {
      expect(rewriteMediaUrl(url)).toBe(url);
      expect(looksLikeStoredMedia(url)).toBe(false);
    }
  });

  it('rewrites URLs nested anywhere in a payload', () => {
    const payload = {
      vehicle: { photos: [{ url: stale }, { url: stale }] },
      host: { avatar: stale },
      unrelated: 'just a string',
      count: 3,
    };
    const out = normaliseMediaUrls(payload);
    expect(out.vehicle.photos[0].url.startsWith(base)).toBe(true);
    expect(out.vehicle.photos[1].url.startsWith(base)).toBe(true);
    expect(out.host.avatar.startsWith(base)).toBe(true);
    expect(out.unrelated).toBe('just a string');
    expect(out.count).toBe(3);
  });

  it('survives a self-referencing object instead of hanging', () => {
    // A request that never returns is worse than a stale photo.
    const a: Record<string, unknown> = { url: stale };
    a.self = a;
    expect(() => normaliseMediaUrls(a)).not.toThrow();
    expect((a.url as string).startsWith(base)).toBe(true);
  });

  it('does not walk forever down a deep tree', () => {
    let deep: Record<string, unknown> = { url: stale };
    for (let i = 0; i < 50; i += 1) deep = { child: deep };
    expect(() => normaliseMediaUrls(deep)).not.toThrow();
  });

  it('passes null and undefined through untouched', () => {
    expect(normaliseMediaUrls(null)).toBeNull();
    expect(normaliseMediaUrls(undefined)).toBeUndefined();
  });

  it('leaves Dates intact rather than walking into them', () => {
    const d = new Date('2026-01-01');
    const out = normaliseMediaUrls({ at: d });
    expect(out.at).toBeInstanceOf(Date);
    expect(out.at.getTime()).toBe(d.getTime());
  });

  it('handles an array at the top level', () => {
    const out = normaliseMediaUrls([{ url: stale }]);
    expect(out[0].url.startsWith(base)).toBe(true);
  });
});
