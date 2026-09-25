import { stripUnsafeKeys } from './sanitize';

describe('stripUnsafeKeys', () => {
  it('removes Mongo operators at any depth', () => {
    expect(stripUnsafeKeys({ email: { $ne: null }, ok: 'x', nested: { $where: '1', keep: 1 } })).toEqual({
      email: {},
      ok: 'x',
      nested: { keep: 1 },
    });
  });

  it('removes dotted paths, and cleans arrays of objects', () => {
    expect(stripUnsafeKeys({ 'a.b': 1, list: [{ $gt: 1, v: 2 }, 3] })).toEqual({ list: [{ v: 2 }, 3] });
  });

  it('leaves plain values alone', () => {
    expect(stripUnsafeKeys('text')).toBe('text');
    expect(stripUnsafeKeys(null)).toBeNull();
    expect(stripUnsafeKeys({ n: 1, s: 'a', b: true })).toEqual({ n: 1, s: 'a', b: true });
  });
});
