import argon2 from 'argon2';
import { config } from '../../../config';

/**
 * One place that hashes and verifies passwords.
 *
 * Salt (which argon2 adds automatically, per password) stops precomputation and
 * forces an attacker to crack each hash separately. It does NOT help once the
 * database leaks, because the salt leaks with it — the attacker can then
 * brute-force weak passwords offline.
 *
 * A PEPPER closes that gap. It is a server-side secret kept OUT of the database
 * (env / secrets manager), mixed into every password via argon2's `secret`
 * option. If only the database is stolen — the common breach — the hashes are
 * uncrackable without it, even for "password123".
 *
 * The pepper is optional. Without it, hashing is salt-only, which is still
 * strong; with it, a DB-only compromise yields nothing.
 */

// OWASP-aligned argon2id parameters. Centralised so a future bump is one edit,
// and so needsRehash below can compare against exactly what we hash with.
const PARAMS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB — memory-hard, which is what defeats GPU cracking
  timeCost: 3,
  parallelism: 4,
};

const pepper = config.password.pepper;
const withSecret = (o: argon2.Options): argon2.Options =>
  pepper ? { ...o, secret: pepper } : o;

/** Hash a plaintext password for storage. */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, withSecret(PARAMS));
}

/**
 * Verify a password, and report whether the stored hash should be upgraded.
 *
 * `needsRehash` is true when the hash is valid but was made under an older
 * scheme — weaker params, or before the pepper existed. The caller rehashes on
 * a successful login, so the whole userbase migrates forward transparently with
 * no downtime and no mass migration. That is also what makes adding the pepper
 * now safe for the accounts that already exist.
 */
export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  // Current scheme: with the pepper if one is configured.
  try {
    if (await argon2.verify(hash, plain, withSecret({}))) {
      return { valid: true, needsRehash: argon2.needsRehash(hash, PARAMS) };
    }
  } catch {
    // Malformed hash or a mismatch — fall through to the legacy attempt.
  }

  // Legacy: a hash created before the pepper was introduced has no secret baked
  // in, so it verifies WITHOUT one. A success here means the right password
  // under the old scheme — valid, and due for an upgrade to the peppered hash.
  if (pepper) {
    try {
      if (await argon2.verify(hash, plain)) {
        return { valid: true, needsRehash: true };
      }
    } catch {
      // fall through
    }
  }

  return { valid: false, needsRehash: false };
}
