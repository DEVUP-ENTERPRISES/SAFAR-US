# Admin isolation

The rule the owner set: **only the `.env` admin is an admin, no request can ever
create or promote one, and the panel is not reachable the way the public site
is.** This document is the deployment half. The application half is already
enforced in code and does not depend on any of this being configured:

| Guarantee | Where it lives | Depends on infra? |
|---|---|---|
| No API can set or escalate a role | `registerSchema` strips it; register hardcodes fields; no role-write endpoint exists | No |
| Admin authz re-checked against the DB every request | `requireAdmin` middleware | No |
| Exactly one super_admin, the `.env` one | `enforceSingleSuperAdmin` (boot) + `requireAdmin` (per request) | No |
| Admin login rate-limited + brute-force capped | `authLimiter`, Redis-backed | No |
| Every admin mutation audited | `auditLog('admin')` | No |
| MFA on admin login | TOTP in the login flow | No |

Everything below is **defense in depth on top of that** — it shrinks the attack
surface, it does not create the guarantee.

---

## 1. Put the console on its own hostname

Serve the admin console from `admin.yourdomain.com`, separate from the public
`app.yourdomain.com`. One app can still back both (the console already lives
behind a secret slug), or you can run a dedicated admin process — see §4. Either
way the isolation below is applied to the hostname.

## 2. Cloudflare Access (Zero Trust) — the edge identity gate

This is the single highest-value control and it is the correct home for "WAF"
and "MFA-ready". Cloudflare Access sits in front of `admin.yourdomain.com` and
**refuses to pass a request to the origin at all** unless the caller has already
proven who they are at the edge:

1. Cloudflare dashboard → Zero Trust → Access → Applications → Add.
2. Application domain: `admin.yourdomain.com`.
3. Policy: **Allow**, and scope it to the admin's exact email
   (`ADMIN_EMAIL`). One rule, one identity.
4. Require a second factor: enable **One-time PIN** or a Google/GitHub SSO
   identity provider with MFA enforced.
5. Session duration: short (e.g. 8h) so a walk-away laptop re-authenticates.

The result: an attacker who steals the admin's app password still cannot even
reach the login page without also passing Cloudflare's identity + MFA challenge.
The application's own TOTP is then a third factor behind that.

## 3. NGINX — the origin is not publicly reachable

The admin origin (whatever port it listens on — `3005` if you split it out) must
never accept a request that did not come through Cloudflare. Two layers:

```nginx
# admin.yourdomain.com — the ONLY public entry to the console.
server {
  server_name admin.yourdomain.com;

  # 1. Only Cloudflare may connect. Everything else is dropped before routing.
  #    Refresh from https://www.cloudflare.com/ips/ on deploy.
  #    (allow <cloudflare ranges>; then:)
  deny all;

  # 2. Cloudflare Access signs every forwarded request with a JWT. Verify it
  #    here so a request that skipped Access (origin IP leak) is still refused.
  #    See Cloudflare's "Validate JWTs" — the Team domain + AUD tag.

  location / {
    proxy_pass http://127.0.0.1:3005;   # admin app, bound to loopback only
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Critically, the admin process **binds to `127.0.0.1:3005`, not `0.0.0.0`** — so
`:3005` is not listening on any public interface and cannot be hit directly even
from inside the datacenter. The EC2 security group should also not expose 3005.

> `TRUST_PROXY_HOPS` still applies. With Cloudflare in front of NGINX that is
> **2** (see DEPLOY.md), or the rate limiter keys on the wrong address.

## 4. If you split the admin into its own app/process on :3005

This is optional. The security guarantee does not need it — it is code-level and
already met — but a separate process gives you a smaller bundle, an independent
deploy, and a blast-radius boundary. Two ways, cheapest first:

- **Same codebase, second process.** Run a second instance of the existing app
  bound to `127.0.0.1:3005`, and have NGINX send only `admin.yourdomain.com` to
  it. No code split, no duplication; the isolation is entirely at the proxy.
- **Separate app folder (`/admin-web`).** A standalone Next app that imports the
  shared UI as a workspace package. Cleanest boundary, but it is a real
  refactor — the 28 console pages and their hooks move, and the shared component
  library becomes a package both apps consume. Do this deliberately, not in the
  last days before launch.

## 5. Provisioning and rotating the one admin

- The admin exists only because `ADMIN_EMAIL` / `ADMIN_PASSWORD` are set. There
  is no "create admin" anywhere else.
- To rotate: change the env values and restart. `seedAdmin` sets the password
  only on creation, so to reset an existing admin's password, change it through
  the app's own change-password flow, or delete the record and let the seed
  recreate it.
- `ADMIN_PASSWORD` must be long and unique — the production env guard already
  refuses to boot on a short or placeholder value.
