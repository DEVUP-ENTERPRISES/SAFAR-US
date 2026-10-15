// Generated from frontend/src/features/auth/session.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { tokenStore } from '../../lib/api/token-store';
import { disconnectSocket } from '../../lib/realtime/socket';
import { ApiError, isTransientError } from '../../lib/api/types';
import { authApi } from './api';
import { useAuthStore } from './store';
import type { AuthResult, LoginInput } from './types';

/** Roles that may enter the admin back-office. */
export const ADMIN_ROLES = ['admin', 'support', 'moderator', 'finance', 'ops', 'super_admin'];
/** Every staff role; customer sign-in turns all of them away. */
export const STAFF_ROLES = ADMIN_ROLES;

export interface LoginOptions {
  /** Where to go after a successful login. */
  redirectTo?: string;
  /** If set, the account must hold at least one of these roles or login is denied. */
  requireAnyRole?: string[];
  /**
   * If set, an account holding ANY of these roles is refused. The public login
   * uses it to turn staff away: an admin session must be minted in the admin
   * app, never in the public browser context where a future XSS could reach it.
   */
  denyAnyRole?: string[];
  /** Human label for the portal (used in the denial message). */
  portalLabel?: string;
}

/** The portal role gate every sign-in method goes through. */
export function assertPortalAccess(result: AuthResult, opts: LoginOptions): AuthResult {
  if (opts.requireAnyRole && !result.user.roles.some((r) => opts.requireAnyRole!.includes(r))) {
    throw new ApiError('FORBIDDEN', `This account doesn't have access to the ${opts.portalLabel ?? 'requested'} portal.`, 403);
  }
  // Staff turned away from the public portal: admins sign in at the admin app, so an admin session is never created here.
  if (opts.denyAnyRole && result.user.roles.some((r) => opts.denyAnyRole!.includes(r))) {
    throw new ApiError('ADMIN_USE_ADMIN_PORTAL', 'Staff accounts sign in through the admin portal, not the public site.', 403);
  }
  return result;
}

/** Password sign-in through the portal role gate. */
export async function loginWithGate(input: LoginInput, opts: LoginOptions = {}): Promise<AuthResult> {
  return assertPortalAccess(await authApi.login(input), opts);
}

/** Bootstraps the session on load: if a token exists, resolve /users/me. */
export function useSessionBootstrap() {
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await authApi.me();
      setUser({ id: me.id, email: me.email, roles: me.roles });
      return me;
    },
    enabled: typeof window !== 'undefined' && !!tokenStore.getAccess(),
    // A restarting server must not look like a sign-out: keep trying for about a minute before giving up, and never treat that as a rejection.
    retry: (count, err) => count < 8 && isTransientError(err),
    retryDelay: (count) => Math.min(1000 * 2 ** count, 8000),
    staleTime: 5 * 60 * 1000,
  });
}

export function useOnAuthSuccess() {
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  return (result: AuthResult) => {
    tokenStore.set(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
    qc.invalidateQueries({ queryKey: ['me'] });
  };
}

/** Ends the session on the server and clears everything tied to it on this device. */
export async function signOutEverywhere(qc: QueryClient): Promise<void> {
  await authApi.logout().catch(() => ({ loggedOut: true }));
  useAuthStore.getState().signOut();
  qc.clear();
  // The socket carries its own identity from the handshake; left connected, the next person to sign in inherited it.
  disconnectSocket();
}
