# Engineering optimisation audit

Living report for the end-to-end audit standard (`production-audit`). Newest round first. Every claim below says how it was established; nothing here is a projected or invented number.

Legend: **Implemented** · **Verified** (tests / builds / scans run) · **Measured** (before and after numbers) · **Estimated** · **Needs approval / access** · **Deferred** · **Hypothesis** (needs profiling).

---

## Round 1 — 2026-10-23 (branch `release/2.0`)

### 1. System assessment

| Area | What exists |
|---|---|
| Backend | Node 20 + Express modular monolith (`backend/`), MongoDB (Mongoose), Redis (rate limits, cache, locks), Socket.IO realtime, in-process jobs (`backend/src/jobs`). One EC2 process behind Nginx (see DEPLOY.md). |
| Web apps | Six Next.js 15 apps sharing `frontend/src` as `@/`: guest (`frontend`), `admin-web`, `host-web`, `partner-web`, `catodrive-asset-ioc` (operations panel), `insurance-web`. Client-rendered dashboards with React Query; marketing pages static. |
| Mobile | Expo apps in `mobile/` reusing a synced copy of shared web code (`npm run sync:api`). |
| External services | Stripe (payments, Identity), Google / Mapbox maps, Twilio SMS, email API, FCM push, Wheelbase, OpenAI-style AI gateway, NHTSA VIN data, S3 / CDN. |
| CI | `.github/workflows/ci.yml`: backend lint / typecheck / tests / build; guest and admin typecheck + build; dependency audit. |
| Observability | Structured logger; Sentry when `SENTRY_DSN` is set; admin "Failed attempts" screen. No metrics / tracing backend in the repo. |
| Security baseline (confirmed present) | Helmet, CORS allow-list, compression, 1 MB body limits, global + auth-route rate limits (Redis-backed when healthy), server keep-alive / header timeouts, admin API hidden behind a bearer check and a secret path. |

### 2. Confirmed issues

| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | **P0** | Next.js 15.5.25 in all six web apps: unauthenticated remote code execution in the image optimiser with SVGs (GHSA-2464-fhr4-w9xw) and App Router server-action DoS (GHSA-p3m5-59mp-jv5r) | `npm audit --omit=dev`: 1 critical per app | **Implemented + Verified**: 15.5.28 everywhere; audit 0 |
| 2 | P1 | `@grpc/grpc-js` ≤ 1.13.5 (two high advisories) via the Firestore database inside the `firebase` bundle; the apps only use Firebase for web push | `npm audit`, `npm ls @grpc/grpc-js` | **Implemented + Verified**: replaced `firebase` with `@firebase/app` + `@firebase/messaging` (same versions firebase 12.16 used); Firestore / gRPC no longer installed (72-82 fewer packages per app) |
| 3 | P1 | 13 outgoing HTTP calls with no timeout (maps geocode / autocomplete, Google token check, email, SMS, FCM, Stripe Identity file, Wheelbase upload). Node fetch waits up to 300 s, so one slow provider holds requests and job slots for minutes | code scan of every `fetch(` | **Implemented + Verified (tests)**: `AbortSignal.timeout` 5-30 s per call |
| 4 | P1 | CI did not run on `release/**` branches, did not typecheck or build host / partner / operations / insurance apps, and audited only 2 of 7 apps (critical only) | `.github/workflows/ci.yml` | **Implemented**: release branches added, 4-app matrix, shipped-dependency audit at `high` for all 7 apps. Verified locally (audit commands pass); **not yet run on GitHub** |
| 5 | P2 | `ip-address` ≤ 10.7.3 quadratic parsing (moderate) via geoip-lite | `npm audit` backend | **Implemented + Verified**: `npm audit fix`, backend production audit 0 |
| 6 | P3 | Notification retry job looked the same user up once per channel retried (bounded: ≤ 200 notifications per run) | code read, `notification.service.ts` | **Implemented + Verified (tests)**: one lookup per notification. Query count per notification: O(channels) → O(1) |
| 7 | P2 | Firebase web API key is public (by design) but should be restricted | `frontend/public/firebase-messaging-sw.js` | **Needs access**: restrict the key to your domains in Google Cloud console |

Earlier in the same round (UI standard work, already committed): admin lists capped at 20 rows, missing error states on ~70 screens, Tolls car picker capped at 50, Challans capped at 100, insurer trips capped at 100, paid maps autocomplete called on every keystroke, compare remove button not working. All fixed and listed in the commit history.

### 3. Checked and found sound (no change needed)

| Area | Result |
|---|---|
| Secrets in tracked files | Scan for Stripe, AWS, private keys, Mongo URIs with passwords, Slack / GitHub tokens: none real. `sk_test_placeholder` in one test is a placeholder. No `.env` files tracked. |
| Direct `findById(req.params…)` in routes | All four found check ownership or staff permission right after (AI damage review, document verify, trip document history, maintenance complete). Admin router rejects requests without a bearer token. |
| Indexes vs hot queries | Bookings (car + dates, guest, host + status, idempotency), availability (car + day unique), payments (intent unique, booking), chat (booking + time), notifications (user + time, retry flag) match the query shapes in the services. |
| Frontend polling | React Query pauses intervals in hidden tabs (default `refetchIntervalInBackground: false`); 5 s polls only while an ID check is pending and on the admin live-traffic screen. |
| Maps responses | Cached server-side (24 h geocode, 1 h autocomplete). |

### 4. Performance baseline (measured, guest site production build, first-load JS, gzip)

| Route | First-load JS |
|---|---|
| Shared by all pages | 103 kB |
| `/bookings/[id]` | 206 kB |
| `/vehicles/[id]` | 180 kB |
| `/trips/[id]` | 177 kB |
| `/register`, `/login` | 173 kB, 172 kB |
| `/search`, `/` | 152 kB |

No runtime latency, Core Web Vitals or database timings were measured: there is no staging environment with production-like data available to this audit. Nothing here claims a speed improvement.

### 5. Hypotheses (need evidence before acting)

| Item | How to confirm |
|---|---|
| Login / register carry ~70 kB page JS for simple forms (form + validation libraries and possibly more) | Run a bundle analysis (`@next/bundle-analyzer`) before changing anything |
| Admin bookings list filtered by status sorts by `createdAt` without a matching compound index | `explain()` on production-sized data; only add `{ status: 1, createdAt: -1 }` if it shows an in-memory sort |
| Single backend process on one EC2 instance is the scaling ceiling (DEPLOY.md §7.1) | Load test against staging |

### 6. Infrastructure cost

No billing data or cloud console access was available, so no cost figures are claimed. Confirmed code-level savings: maps autocomplete now waits 300 ms after typing (it called the paid API on every key); maps results stay cached. Next steps that need your access: AWS Cost Explorer by service, S3 lifecycle rules for old trip photos, CloudWatch / log retention.

### 7. Deferred

| Item | Why |
|---|---|
| `braces` / `postcss-selector-parser` (dev tooling via Tailwind 3 and Jest file watchers) | Fix is Tailwind 4 / a Jest major change (breaking); never shipped to users. CI fails dev dependencies only on critical. |
| Bundle-size reduction | Needs analysis first (see hypotheses). |

### 8. Tests and commands run

| Command | Result |
|---|---|
| `npm audit --omit=dev` in all 7 apps | 0 vulnerabilities each (after fixes) |
| `npm audit --audit-level=critical` in all 7 apps | pass |
| `npx tsc --noEmit` in all 6 web apps and the backend | pass |
| `next build` guest site | pass (48 pages) |
| Jest: maps, notifications, auth, kyc suites | 91 / 91, notifications 3 / 3 |
| Jest: full backend suite (after all changes) | 589 / 589, 88 suites |
| CI YAML parse | valid |

Not run: GitHub Actions itself, load tests, Lighthouse, real-browser checks against production data.

### 9. Deployment and rollback

- Dependency changes ship with the normal deploy (`npm ci` uses the updated lockfiles). Restart any running dev server after pulling.
- Timeouts change failure timing only: a provider that used to hang now fails after 5-30 s with the same error path.
- Rollback: redeploy the previous commit; no data or schema changes in this round.

### 10. Next priorities

1. Restrict the Firebase web key (your Google Cloud console).
2. Push and watch the first CI run on `release/2.0` with the new jobs.
3. Bundle analysis of `/login`, `/register`, `/bookings/[id]`.
4. Staging with production-like data, then profile slow queries and measure p95 latency before any index or caching change.
5. Plan the Tailwind 4 upgrade separately.
