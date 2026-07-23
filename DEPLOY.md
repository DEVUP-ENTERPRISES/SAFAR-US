# TURA — Deployment Runbook

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
pm2 start dist/main.js --name tura-api
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
The app sets `trust proxy` already, so it reads the real client IP from
`X-Forwarded-For` — which the risk engine and rate limiter depend on. Get the
`X-Forwarded-*` headers right or every request looks like it came from Nginx.

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
  | `NEXT_PUBLIC_APP_NAME` | `TURA` |
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
- `pm2 logs tura-api` — app logs. Background jobs (booking expiry, payouts, trip
  reminders, deposit release) run in-process on a schedule; they log when they act.
- Rotate `JWT_*` secrets and `ADMIN_PASSWORD` on a schedule; both are read only at boot.
- The audit log is append-only — never edit or truncate the `auditlogs` collection.
