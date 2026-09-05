import { createHash, randomInt } from 'crypto';
import { kv } from '../../../infrastructure/cache/kv-store';
import { UnauthorizedError, TooManyRequestsError } from '../../../core/errors/app-error';

const TTL_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;

const otpKey = (purpose: string, target: string): string => `otp:${purpose}:${target.toLowerCase()}`;
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
    await kv().set(otpKey(purpose, target), JSON.stringify({ hash: hash(code), attempts: 0 }), TTL_SECONDS);
    return code;
  }

  async verify(purpose: string, target: string, code: string): Promise<void> {
    const raw = await kv().get(otpKey(purpose, target));
    if (!raw) throw new UnauthorizedError('Code expired or not found');
    const data = JSON.parse(raw) as { hash: string; attempts: number };
    if (data.attempts >= MAX_ATTEMPTS) {
      await kv().del(otpKey(purpose, target));
      throw new TooManyRequestsError('Too many attempts — request a new code');
    }
    if (hash(code) !== data.hash) {
      data.attempts += 1;
      await kv().set(otpKey(purpose, target), JSON.stringify(data), TTL_SECONDS);
      throw new UnauthorizedError('Invalid code');
    }
    await kv().del(otpKey(purpose, target));
  }
}

export const otpService = new OtpService();
