import { kv } from '../../../infrastructure/cache/kv-store';
import { TooManyRequestsError } from '../../../core/errors/app-error';
import { platformConfigService } from '../../platform-config/application/platform-config.service';

const DAY_SECONDS = 86_400;
const MAX_DOUBLINGS = 5;

const failKey = (scope: string, id: string): string => `af:${scope}:${id.trim().toLowerCase()}`;
const lockKey = (scope: string, id: string): string => `al:${scope}:${id.trim().toLowerCase()}`;
const levelKey = (scope: string, id: string): string => `alv:${scope}:${id.trim().toLowerCase()}`;

const LOCKED = 'Too many attempts. Please try again later.';

/**
 * Per-account brute-force guard, keyed on the normalised email/phone so a
 * botnet cannot dodge the per-IP limiter. Failures count in a fixed window;
 * hitting the admin-set cap locks the account for the base minutes, doubling
 * on each repeat lock within a day. The message is identical for real and
 * unknown accounts, so it leaks nothing.
 */
export const attemptGuard = {
  async assertOpen(scope: string, id: string): Promise<void> {
    if (await kv().exists(lockKey(scope, id))) throw new TooManyRequestsError(LOCKED);
  },

  async recordFailure(scope: string, id: string): Promise<void> {
    const { loginAttemptsPerAccount, loginLockoutMinutes } = (await platformConfigService.get()).security;
    const windowSeconds = loginLockoutMinutes * 60;
    const failures = await kv().incr(failKey(scope, id), windowSeconds);
    if (failures < loginAttemptsPerAccount) return;
    const level = await kv().incr(levelKey(scope, id), DAY_SECONDS);
    const lockSeconds = windowSeconds * 2 ** Math.min(level - 1, MAX_DOUBLINGS);
    await kv().set(lockKey(scope, id), '1', lockSeconds);
    await kv().del(failKey(scope, id));
  },

  async clear(scope: string, id: string): Promise<void> {
    await kv().del(failKey(scope, id));
  },
};
