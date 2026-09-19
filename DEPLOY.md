# CatoDrive — Deployment Runbook

Backend on **AWS EC2**, frontend on **Vercel**, DNS on **Cloudflare**.

The backend **refuses to boot in production** with unsafe config (wildcard CORS,
short or placeholder secrets, half-set S3). That is deliberate — a failed boot is
better than a silently insecure one. Work through the checklist and it starts.

---

## 0. Before anything — rotate the leaked key

An AWS access key was pasted into a chat earlier in development. **Rotate it in
IAM before deploying** and never reuse it. Everything below assumes fresh
credentials.

---

## 1. Backend — EC2

### 1.1 Instance
- Ubuntu 22.04 LTS, t3.small or larger.
- Security group inbound: 22 (your IP only), 80, 443. **Not** 8080 from the world —
  Nginx terminates TLS and proxies to 8080 on localhost.
- Install: `Node ≥ 20`, `nginx`, and `pm2` (`npm i -g pm2`).

### 1.2 App
```bash
git clone https://github.com/FaizanMohammed07/kiedo.git && cd kiedo/backend
npm ci
cp .env.example .env      # then fill it in — see 1.3
npm run build             # → dist/
pm2 start dist/main.js --name cato-api
pm2 save && pm2 startup   # survive reboots
```

### 1.3 Production `.env` — the parts the boot guard enforces
| Var | Requirement |
|---|---|
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | explicit list, no `*`, e.g. `https://yourdomain.com,https://www.yourdomain.com` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥ 32 random chars, **different from each other**, not placeholders. `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | ≥ 12 chars, not a placeholder |
| `MONGO_URI` | MongoDB Atlas connection string |
| `REDIS_URL` | Redis Cloud / ElastiCache URL |
| `AWS_*` + `S3_BUCKET` | all set together, real keys (id ≥ 16, secret ≥ 32) |
| `PUBLIC_API_URL` | `https://api.yourdomain.com` — used to build media URLs |
| `ADMIN_SLUG` | your secret console path; must equal the frontend's `NEXT_PUBLIC_ADMIN_SLUG` |
| `EMAIL_*` / `SMS_*` | **strongly recommended** — without them hosts never hear about booking requests, which then expire. Boot logs an error but does not block. |

### 1.4 Nginx (TLS + proxy)
```nginx
server {
  server_name api.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # WebSocket (Socket.IO realtime)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```
#### Client IP — set `TRUST_PROXY_HOPS` to match this diagram

Every IP-keyed decision in the app (both rate limiters, the risk engine, the
audit trail) reads `req.ip`, and Express derives that by walking
`X-Forwarded-For` from the right, skipping exactly `TRUST_PROXY_HOPS`
addresses. The number must equal the proxies actually in front of Node:

| Topology | `TRUST_PROXY_HOPS` |
|---|---|
| Nginx only — Cloudflare grey cloud (DNS only) | `1` |
| **Cloudflare orange cloud → Nginx** (§3, the production setup) | **`2`** |

Both failure modes are real, and they fail in opposite directions:

- **Too low** — `req.ip` becomes the *Cloudflare edge* address. Every user
  behind one Cloudflare datacenter then shares a single rate-limit bucket, so
  ten failed logins from anywhere in a metro lock out that whole region for
  fifteen minutes. This is a self-inflicted outage, not a security hole, and it
  only appears once real traffic arrives.
- **Too high** — a client can forge `X-Forwarded-For` and present as any
  address it likes, which defeats rate limiting and poisons the audit trail.

If you turn the orange cloud on in §3, set `TRUST_PROXY_HOPS=2` in the same
change. If you ever turn it back off, set it to `1`.

Then `certbot --nginx -d api.yourdomain.com` for the certificate.

### 1.5 Health checks
- Liveness: `GET /api/v1/system/health` → 200 when the process is up.
- Readiness: `GET /api/v1/system/ready` → 200 only when Mongo **and** Redis are
  reachable (503 otherwise). Use this one for the load-balancer target.

---

## 2. Frontend — Vercel

- Import the repo, set **root directory** to `frontend/`.
- Framework preset: Next.js (build/output auto-detected).
- Environment variables:
  | Var | Value |
  |---|---|
  | `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api/v1` |
  | `NEXT_PUBLIC_APP_NAME` | `CatoDrive` |
  | `NEXT_PUBLIC_ADMIN_SLUG` | **identical** to the backend `ADMIN_SLUG` |
  | `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | optional; a placeholder map shows without it |

`next.config` uses `output: 'standalone'`, which Vercel handles transparently.

---

## 3. Cloudflare — DNS

| Record | Name | Target | Proxy |
|---|---|---|---|
| A | `api` | EC2 elastic IP | **DNS only (grey cloud)** at first, so Certbot can issue; proxy on afterwards |
| CNAME | `@` / `www` | Vercel's target (from the Vercel dashboard) | per Vercel's instructions |

If you proxy `api` through Cloudflare (orange cloud), set SSL/TLS mode to **Full
(strict)** so Cloudflare↔EC2 stays encrypted end to end.

---

## 4. AWS — S3 & CORS (the one that bites in production)

The bucket keeps **Block Public Access ON**. Media is served through the API's
signed `/media/view` route, so the bucket never needs to be public.

But the browser uploads photos **directly** to S3 with a presigned PUT, and that
is a cross-origin request. The bucket CORS rule currently only allows
`http://localhost:3000`. **Add the production origin**, or every photo upload
fails in production while passing every server-side test:
```json
[{
  "AllowedOrigins": ["https://yourdomain.com"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}]
```
Optional but recommended: put a CloudFront distribution in front of the bucket
and set `S3_PUBLIC_BASE_URL` to its domain — then media URLs point straight at
the CDN instead of round-tripping the API. A placeholder value there is rejected
at boot, so leave it blank until you have a real distribution.

---

## 5. First-boot checks
```bash
curl https://api.yourdomain.com/api/v1/system/ready        # {"mongo":true,"redis":true}
# admin console — note the slug, /admin itself 404s by design
open https://yourdomain.com/<ADMIN_SLUG>/login
# email/SMS wiring, if configured:
#   POST /api/v1/notifications/test  (super_admin) → per-channel delivery result
```

## 6. Ops
- `pm2 logs cato-api` — app logs. Background jobs (booking expiry, payouts, trip
  reminders, deposit release) run in-process on a schedule; they log when they act.
- Rotate `JWT_*` secrets and `ADMIN_PASSWORD` on a schedule; both are read only at boot.
- The audit log is append-only — never edit or truncate the `auditlogs` collection.

---

## 7. Standing up to real traffic — DDoS, WAF, and scaling out

Sizing reference: **1,000 active users, ~10,000 concurrent requests, ~1,000
simultaneous bookings.** The application code handles that correctly (holds are
enforced by a unique index, rate limits and sessions are Redis-backed so they
work across instances). What follows is the part that is **not** in the code and
has to be done here.

### 7.1 The single biggest gap — you are running one process

`pm2 logs cato-api` implies a single instance. One Node process is one CPU core;
at 1,000 concurrent bookings it is the entire ceiling. Nothing in the repo runs
more than one.

Cheapest real fix, same box:

```bash
pm2 start dist/main.js -i max --name cato-api   # one worker per core
pm2 save
```

This works because the app was **already built to run multi-instance** — worth
stating explicitly, because the usual two cluster-mode hazards are both already
handled here and you do not need to work around them:

- **Background jobs do not duplicate.** They are BullMQ repeatable jobs keyed by
  `jobId`, so every worker registering them is idempotent, and each scheduled
  occurrence is claimed by exactly one worker. Payouts and booking-expiry will
  not fire N times under `-i max`. No `NODE_APP_INSTANCE` guard needed.
- **Socket.IO rooms are already cluster-wide.** `@socket.io/redis-adapter` is
  wired in `src/realtime/index.ts`, so an emit from any worker reaches a client
  connected to any other.

Sessions and both rate limiters are Redis-backed for the same reason.

### 7.2 Database tier is the real ceiling

`MONGO_MAX_POOL` (default 50) must stay **below the Atlas tier's connection
cap**, and that cap is per-cluster, shared by every worker:

    total connections ≈ MONGO_MAX_POOL × pm2 workers

M10 allows 1,500; shared tiers (M0/M2/M5) allow far fewer and throttle IOPS
hard. Four workers × 50 = 200 connections, which a shared tier will refuse.
**Check your actual tier before enabling cluster mode.**

Redis needs the same arithmetic and is the easier one to overrun, because each
worker opens roughly **five** connections, not one: cache/session, BullMQ queue,
BullMQ worker, plus the Socket.IO adapter's pub and sub pair. Four workers ≈ 20
connections — already most of a 30-connection free tier, before any headroom for
reconnects during a deploy.

### 7.3 Cloudflare — turn the proxy on and actually configure it

Section 3 leaves `api` on DNS-only (grey cloud) so Certbot can issue. **Once TLS
is working, switch it to proxied (orange cloud)** — grey cloud means every
request hits EC2 directly and Cloudflare's DDoS protection is doing nothing.
Then set `TRUST_PROXY_HOPS=2` (Cloudflare → Nginx → Node); leaving it at 1
collapses every IP-keyed decision onto Cloudflare's edge IPs, and ten failed
logins from one metro locks out everyone behind that POP.

Minimum rules worth having:

| Rule | Where | Why |
|---|---|---|
| **Managed Ruleset** (OWASP Core) | Security → WAF | Injection/traversal patterns the app never sees |
| Rate limit `/api/v1/auth/*` → 20 req/min per IP | Security → WAF → Rate limiting | Backstop *in front of* the app's own 10/15min limiter, so credential stuffing burns Cloudflare quota not EC2 CPU |
| Rate limit `/api/v1/*` → 600 req/min per IP | same | The app's 120/min is per-process and only counts requests that *complete* |
| Bot Fight Mode | Security → Bots | Scrapers pulling the whole vehicle catalogue |
| Block non-Stripe IPs on `/payments/webhooks/*` | Security → WAF custom rule | Signature verification already rejects forgeries, but this stops them costing you a request |

Cloudflare's rate limiting counts requests it **terminates**, which is what makes
it a genuine DDoS control. The Express limiter cannot see a slow-loris
connection that never finishes a request — the timeouts in `main.ts`
(`requestTimeout: 30s`) handle that case, but only after the socket is already
held.

### 7.4 What to watch when load arrives

- `/api/v1/system/ready` — 503s when Mongo or Redis is unreachable; wire it to
  the load balancer so a sick instance stops receiving traffic.
- Atlas → Metrics → **connections** and **opcounters**. Connections flatlining at
  a ceiling means `MONGO_MAX_POOL × workers` exceeded the tier.
- `pm2 monit` — a worker pinned at 100% CPU while others idle means requests are
  not being distributed (usually a sticky-session misconfiguration).
