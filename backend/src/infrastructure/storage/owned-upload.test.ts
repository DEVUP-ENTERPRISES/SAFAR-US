import { resolveOwnedUpload } from './owned-upload';
import { parseKey } from './storage.gateway';

const KEY = 'kyc/2026/09/user-1/abc.jpg';

describe('resolveOwnedUpload', () => {
  it('accepts the caller\'s own key and derives the URL server-side', () => {
    const out = resolveOwnedUpload({ key: KEY, url: 'javascript:alert(1)' }, 'user-1', 'kyc');
    expect(out.key).toBe(KEY);
    expect(out.url).toMatch(/^https?:\/\//);
    expect(out.url).not.toContain('javascript');
  });

  it('rejects javascript:, data: and foreign-host URLs with no valid key', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'https://evil.com/x.png']) {
      expect(() => resolveOwnedUpload({ url }, 'user-1', 'kyc')).toThrow();
    }
  });

  it('rejects someone else\'s key and the wrong category', () => {
    expect(() => resolveOwnedUpload({ key: KEY }, 'user-2', 'kyc')).toThrow();
    expect(() => resolveOwnedUpload({ key: KEY }, 'user-1', 'insurance')).toThrow();
  });

  it('recovers the key from our own /media/view URL', () => {
    const url = `https://api.example.com/media/view?key=${encodeURIComponent(KEY)}`;
    expect(resolveOwnedUpload({ url }, 'user-1', 'kyc').key).toBe(KEY);
  });
});

describe('parseKey strictness', () => {
  it('rejects traversal, empty segments, leading slash, backslashes and unknown categories', () => {
    for (const k of ['/kyc/2026/09/u/a.jpg', 'kyc/2026/../u/a.jpg', 'kyc//09/u/a.jpg', 'kyc/2026/09/u\\x/a.jpg', 'nope/2026/09/u/a.jpg', 'kyc/2026/09/u']) {
      expect(parseKey(k)).toBeNull();
    }
    expect(parseKey(KEY)).toEqual({ category: 'kyc', ownerId: 'user-1' });
  });
});
