import express from 'express';
import type { AddressInfo } from 'net';

/**
 * Client-IP resolution under the deployed proxy chain.
 *
 * app.ts hardcoded `trust proxy` to 1 while DEPLOY.md describes Cloudflare ->
 * Nginx -> Node, which is two hops. That mismatch does not throw, does not log,
 * and is invisible until real traffic arrives — at which point req.ip is the
 * Cloudflare edge address and every user behind one Cloudflare datacenter
 * shares a single rate-limit bucket.
 *
 * These tests pin the arithmetic in both directions so the hop count can never
 * drift from the topology silently again.
 */

/** What Node receives once Cloudflare and Nginx have each appended a hop. */
const CHAIN = '203.0.113.9, 172.68.44.7';
const CLIENT = '203.0.113.9';
const CLOUDFLARE_EDGE = '172.68.44.7';

async function ipSeenBy(hops: number, forwardedFor: string): Promise<string> {
  const app = express();
  app.set('trust proxy', hops);
  app.get('/', (req, res) => {
    res.end(req.ip);
  });

  const server = app.listen(0);
  try {
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { 'X-Forwarded-For': forwardedFor },
    });
    return await res.text();
  } finally {
    server.close();
  }
}

describe('trust proxy hop count', () => {
  it('resolves the real client behind Cloudflare and Nginx with 2 hops', async () => {
    expect(await ipSeenBy(2, CHAIN)).toBe(CLIENT);
  });

  it('collapses onto the Cloudflare edge with only 1 hop — the bug this pins', async () => {
    // Not the behaviour we want, but proving it keeps the reason for
    // TRUST_PROXY_HOPS legible: every user behind this edge would share one
    // rate-limit bucket.
    expect(await ipSeenBy(1, CHAIN)).toBe(CLOUDFLARE_EDGE);
  });

  it('resolves the client with 1 hop when Cloudflare is grey-clouded', async () => {
    // DNS-only: Nginx is the sole proxy, so it appends the client itself.
    expect(await ipSeenBy(1, CLIENT)).toBe(CLIENT);
  });

  it('lets a client forge its address when hops exceed the real chain', async () => {
    // The opposite failure: with 2 hops but only Nginx in front, the attacker
    // controls the value Express trusts.
    expect(await ipSeenBy(2, '1.2.3.4, 203.0.113.9')).toBe('1.2.3.4');
  });
});
