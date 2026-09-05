import { hashPassword, verifyPassword } from './password';

/**
 * The password module's real behaviour under the test env (no pepper set), which
 * is the salt-only path every deployment falls back to. The pepper-specific
 * guarantees — a peppered hash being uncrackable without the pepper, and legacy
 * hashes upgrading without lockout — are proven separately against argon2 with a
 * controlled secret; here we pin the module's contract.
 */
describe('password hashing', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('CorrectHorseBattery1!');
    const { valid } = await verifyPassword(hash, 'CorrectHorseBattery1!');
    expect(valid).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('CorrectHorseBattery1!');
    const { valid } = await verifyPassword(hash, 'wrong-password');
    expect(valid).toBe(false);
  });

  it('produces a different hash each time (per-password salt)', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toBe(b);
  });

  it('does not flag a freshly-made hash for rehash', async () => {
    const hash = await hashPassword('CorrectHorseBattery1!');
    const { valid, needsRehash } = await verifyPassword(hash, 'CorrectHorseBattery1!');
    expect(valid).toBe(true);
    expect(needsRehash).toBe(false);
  });

  it('never returns valid for a malformed hash', async () => {
    const { valid } = await verifyPassword('not-a-real-argon2-hash', 'anything');
    expect(valid).toBe(false);
  });
});
