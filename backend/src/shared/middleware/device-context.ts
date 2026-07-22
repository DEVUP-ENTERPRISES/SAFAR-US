import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: {
        fingerprint?: string;
        ip?: string;
        userAgent?: string;
        platform?: string;
        emulator?: boolean;
        rooted?: boolean;
        vpn?: boolean;
      };
    }
  }
}

const bool = (v?: string) => (v === undefined ? undefined : v === 'true' || v === '1');

/**
 * Collect device and network context from every request.
 *
 * Everything here is client-asserted and therefore untrustworthy on its own —
 * a fingerprint can be forged and the emulator flag can simply be omitted. It
 * is useful anyway, because forging it consistently across a fleet of fake
 * accounts is work, and inconsistency is itself a signal.
 *
 * The client IP is taken from the proxy chain, which is why `trust proxy` must
 * be set correctly: read naively, every request appears to come from the load
 * balancer and every geo signal becomes noise.
 */
export function deviceContext(req: Request, _res: Response, next: NextFunction): void {
  const h = (name: string) => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };

  req.device = {
    fingerprint: h('x-device-id'),
    ip: req.ip,
    userAgent: h('user-agent'),
    platform: h('x-platform'),
    emulator: bool(h('x-device-emulator')),
    rooted: bool(h('x-device-rooted')),
    // Set by the edge/CDN, which can see far more than we can from here.
    vpn: bool(h('x-vpn-detected')),
  };
  next();
}
