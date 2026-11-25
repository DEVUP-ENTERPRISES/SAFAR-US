import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { createApp } from '../app';
import { config } from '../config';
import { tokenService } from '../modules/auth/application/token.service';
import { sessionStore } from '../modules/auth/infrastructure/session.store';
import { permissionsForRoles } from '../shared/constants/rbac';

export interface TestApi {
  base: string;
  close(): Promise<void>;
  call<T = unknown>(method: string, path: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; body: { data?: T; error?: { code?: string; message?: string }; meta?: unknown } }>;
}

/** The real Express app on a random local port, so scenarios go through every middleware a browser would. */
export async function startTestApi(): Promise<TestApi> {
  const server: Server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${config.app.apiPrefix ?? '/api/v1'}`;
  return {
    base,
    close: () => new Promise((r) => server.close(() => r())),
    async call(method, path, opts = {}) {
      const res = await fetch(base + path, {
        method,
        signal: AbortSignal.timeout(10_000),
        headers: {
          connection: 'close',
          ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...opts.headers,
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const text = await res.text();
      let body: never;
      try {
        body = JSON.parse(text) as never;
      } catch {
        body = { raw: text } as never;
      }
      return { status: res.status, body };
    },
  };
}

/** A live session and access token for a seeded user, the same as after a real sign-in. */
export async function tokenFor(userId: string, roles: string[] = ['guest']): Promise<string> {
  const sid = randomUUID();
  const pair = tokenService.issuePair({ sub: userId, sid, roles, permissions: permissionsForRoles(roles) });
  await sessionStore.create(sid, userId, randomUUID());
  return pair.accessToken;
}
