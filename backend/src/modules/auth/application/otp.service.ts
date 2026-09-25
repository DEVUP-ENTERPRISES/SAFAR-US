import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { kv } from '../../../infrastructure/cache/kv-store';
import { UnauthorizedError, TooManyRequestsError } from '../../../core/errors/app-error';
import { attemptGuard } from './attempt-guard';

const TTL_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;

const otpKey = (purpose: string, target: string): string => `otp:${purpose}:${target.toLowerCase()}`;
const attemptsKey = (purpose: string, target: string): string => `otpatt:${purpose}:${target.toLowerCase()}`;
const rateKey = (target: string): string => `otprate:${target.toLowerCase()}`;

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Time-boxed, hashed, single-use OTPs with per-target send throttling and
 * attempt caps. Codes are stored hashed in Redis (never in the clear).
 */
export class OtpService {
  async request(purpose: string, target: string): Promise<string> {
    // Throttle sends per target.
    const rawRate = await kv().get(rateKey(target));
    const sends = rawRate ? Number(rawRate) : 0;
    if (sends >= MAX_SENDS_PER_WINDOW) {
      throw new TooManyRequestsError('Too many codes requested — try again later');
    }
    await kv().set(rateKey(target), String(sends + 1), 900);

    // crypto.randomInt, not Math.random: an OTP is a secret, and a predictable
    // PRNG makes the code guessable independent of the attempt cap. randomInt
    // draws from the OS CSPRNG and is unbiased across the range.
    const code = String(randomInt(100000, 1000000)); // 6 digits, [100000, 999999]
    await kv().set(otpKey(purpose, target), JSON.stringify({ hash: hash(code) }), TTL_SECONDS);
    await kv().del(attemptsKey(purpose, target));
    return code;
  }

  async verify(purpose: string, target: string, code: string): Promise<void> {
    const scope = `otp:${purpose}`;
    await attemptGuard.assertOpen(scope, target);
    // Count the attempt atomically BEFORE comparing, so parallel guesses cannot all see a fresh counter.
    const attempts = await kv().incr(attemptsKey(purpose, target), TTL_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      await kv().del(otpKey(purpose, target));
      await attemptGuard.recordFailure(scope, target);
      throw new TooManyRequestsError('Too many attempts — request a new code');
    }
    const raw = await kv().get(otpKey(purpose, target));
    if (!raw) throw new UnauthorizedError('Code expired or not found');
    const data = JSON.parse(raw) as { hash: string };
    const expected = Buffer.from(data.hash, 'hex');
    const given = Buffer.from(hash(code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await attemptGuard.recordFailure(scope, target);
      throw new UnauthorizedError('Invalid code');
    }
    await kv().del(otpKey(purpose, target));
    await kv().del(attemptsKey(purpose, target));
    await attemptGuard.clear(scope, target);
  }
}

export const otpService = new OtpService();
