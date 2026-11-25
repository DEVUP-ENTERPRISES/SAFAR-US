# Engineering optimisation audit

Living report for the end-to-end audit standard (`production-audit`). Newest round first. Every claim below says how it was established; nothing here is a projected or invented number.

Legend: **Implemented** · **Verified** (tests / builds / scans run) · **Measured** (before and after numbers) · **Estimated** · **Needs approval / access** · **Deferred** · **Hypothesis** (needs profiling).

---

## Host side, module by module — 2026-11-25

Same method as the guest round: read each host module, then drive it through the real HTTP API (`backend/src/modules/hosts/host.scenarios.test.ts`, 48 scenarios). Payments mocked; nothing live touched.

| # | Sev | Module | Finding (evidence) | Status |
|---|---|---|---|---|
| 1 | P0 | Hosts / payouts | Every host profile save sent `bankingDetails`, and the service replaced the whole object, wiping `stripeConnectedAccountId`. Any host who saved their profile lost their payout link. | Implemented + Verified (H1, H2): fields merged one by one, Stripe id never writable from the profile. Recovery: `accountIdOf` re-finds the account on Stripe by the `hostId` in its metadata on onboarding, status, dashboard and transfer, saves it back, caches a miss for 1 h. Not verified against live Stripe |
| 2 | P1 | Documents | Once a car's insurance or registration lapsed it stayed paused forever: the check looked for ANY expired paper and old papers are never retired, so a renewal changed nothing. | Implemented + Verified (D2–D5): lapsed only when no current, non-rejected paper of that type is valid; one rule for the sweep and the booking gate |
| 3 | P1 | Vehicles | Staff "suspend" set the same `paused` status a host uses, so the host could relist a car staff took down (also undid the suspend step of deplatforming). | Implemented + Verified (C6, C7, D5): `staffHold` flag; host relist, pause end, recall release and compliance restore all respect it; staff approve lifts it |
| 4 | P1 | Violations | A citation could be filed on a booking where the guest never picked up the car (window checked against booked dates only); a ticket during a late return was refused. | Implemented + Verified (V2–V4): requires a handover; window is handover to actual return. Partner notices that miss go to ops review (`no_trip`) instead of failing |
| 5 | P1 | Violations | Guests never saw the "See the notice" link: page read `evidenceUrl`, server stores `evidence[]`, and the file is private to whoever uploaded it. | Implemented + Verified (V7): `GET /violations/:id/evidence/:i` gives the guest, host or staff a short-lived link; page opens it |
| 6 | P1 | Vehicles, claims, violations, host avatar | Listing photos, claim evidence, citation evidence and the public host photo accepted any URL (including `javascript:` and tracking images). | Implemented + Verified (C1–C4, V5, L1, H4, H5): only the person's own upload of the right category, URL rebuilt server-side; 40 photos max. Wheelbase import now skips a photo it cannot copy instead of linking the outside address |
| 7 | P2 | Calendar | Host "unblock" deleted days held by a scheduled pause; end before start crashed (empty bulk write); unbounded ranges. | Implemented + Verified (K1–K6) |
| 8 | P2 | Pricing | Host discounts could stack to 100% (car free, platform still pays daily insurance); no ceilings on daily price, cleaning fee, weekend multiplier; seasonal rules unbounded and unchecked. | Implemented + Verified (P1–P4): combined host discount capped by admin setting `pricing.maxHostDiscountBps` (default 80%, Admin > Economics > Rules > Host limits) |
| 9 | P2 | Captains | Team invite links never expired. | Implemented + Verified (T1, T2): admin setting `hostStaff.inviteValidDays` (default 7) |
| 10 | P2 | Claims | Filing window counted from the booked end, so a late return shortened the host's window. | Implemented (counts from actual return) |
| 11 | P3 | Hosts | Business and tax details were replaced wholesale on save, dropping fields the form does not send. | Implemented + Verified (H3) |
| 12 | P3 | Earnings | `?days=abc` produced NaN. | Implemented + Verified (H8) |

Verified as already correct: maintenance, toll accounts, earnings and booking approval are scoped to the host's own records (B1–B3, T3, C5, K6, D6, V6).

---

## Guest side, module by module — 2026-11-25

Method: each guest module read end to end, then exercised through the real HTTP API (new harness `backend/src/testing/http.ts` starts the app on a random port with real sessions). 121 scenarios across 6 suites (`*.scenarios.test.ts`). Payments mocked; in-memory Mongo; nothing live touched.

| # | Sev | Module | Finding (evidence) | Status |
|---|---|---|---|---|
| 1 | P1 | Messaging | Chat attachments accepted any URL, including `javascript:`, and the chat renders file attachments as a link, so a click ran script (stored XSS between guest and host). Socket path skipped validation entirely (no length cap). | Implemented + Verified (M6–M10, Q5): one gate `cleanMessage` for REST and socket; only the sender's own `message` upload, URL rebuilt server-side |
| 2 | P1 | Users | Date of birth could be edited after the ID check confirmed it; insurance age falls back to the profile date, so an under-25 could lower their own surcharge. Profile and onboarding had separate DOB rules. | Implemented + Verified (P6–P8): one `assertAdultDob`, locked once `verifiedDob` exists, profile shows it read-only |
| 3 | P1 | Vehicles | Any car (draft, unverified, suspended, banned host) was viewable by id. | Implemented + Verified (V2, V2b): off-market cars only for owner, staff, the host's Captains, and guests who booked it |
| 4 | P2 | Messaging | Long chats returned the oldest 200 messages, so the newest disappeared after 200. Same in the admin thread (500). | Implemented + Verified (M11) |
| 5 | P2 | Messaging | A host could open a pre-booking thread with any user id (unsolicited messages). | Implemented + Verified (Q2) |
| 6 | P2 | Search | `instantBook=false` was read as true (`z.coerce.boolean`). | Implemented + Verified (S6) |
| 7 | P2 | Search | Price/rating/newest sorts sorted only the nearest N cars in memory, so "cheapest" was not the cheapest. Now sorted in the database across the radius. | Implemented + Verified (S3, S4). Index note: `$geoWithin` + sort uses the 2dsphere index then sorts matches; fine at current catalog size, add a compound index only if profiling shows it |
| 8 | P2 | Search | Result filter and filter-count filter were two copies; counts ignored delivery/features. One `matchFilter` now feeds both. | Implemented + Verified (S12) |
| 9 | P2 | Reviews | No closing time on writing a review: after the blind window released one side, the other could read it and reply. | Implemented + Verified (R8) |
| 10 | P3 | Reviews | Deleted reviews still counted in car/host ratings; list endpoints accepted a missing subject. | Implemented + Verified (R9, R10) |
| 11 | P3 | Favorites | Any string saved as a favorite, unbounded list, off-market cars shown, order lost. | Implemented (200 cap, listed cars only, saved order) |
| 12 | P3 | Search, chat UI | Impossible ranges (end before start, max price below min) now refused by the API; the website drops a half-typed max instead of erroring. Chat send now reports failure and keeps the text; 2,000-character counter. | Implemented, typechecked; not browser-tested |
| 13 | P3 | Config | `ALLOW_TEST_STRIPE_IN_PRODUCTION` in `env.schema.ts` still uses `z.coerce.boolean`; unused (main.ts reads the raw string). | Deferred: dead field, safe to delete in a cleanup |

Access sweep (verified): a stranger and an unrelated host were refused (403/404) on 18 guest booking routes and 6 trip routes, and the booking was unchanged afterwards.

---

## UX patterns round — 2026-11-07 (admin, operations panel, partner portal)

Checked the three panels against a 20-pattern SaaS UX list. Shared code lives in `frontend/src`, so each fix lands in all three.

| Pattern | Before | Now |
|---|---|---|
| Command palette, keyboard shortcuts | Missing | **Implemented**: `components/layout/command-palette.tsx`, mounted by `PanelSidebar`. Ctrl/⌘K opens page search, `/` focuses the page's search box, `?` lists shortcuts. Same nav items as the sidebar, so it never offers a page the person can't reach |
| Optimistic UI | Only favourites | **Implemented** where it's safe: mark-read in the bell and the ops inbox (`features/notifications/use-mark-read.ts`, rolls back on failure). The two copies of that mutation are now one. Money, identity and approval decisions stay server-confirmed on purpose |
| Graceful error recovery | Admin had a route error screen; ops and partner had none; no offline signal; non-API errors could show raw text in toasts | **Implemented**: one shared `app/error.tsx` and `app/global-error.tsx`, re-exported by each app; `ConnectionBanner` in `Providers`; network failures toast "Couldn't save changes. Your work is safe."; other messages pass through `safeMessage` |
| Custom 404 | Ops and partner had one; admin showed Next's default | **Implemented** `admin-web/src/app/not-found.tsx` (slug-aware link). Signed-out visitors still see only the sign-in screen, by design |
| Search box accessibility | Fleets search had no label | **Implemented**: `type="search"` and labels on admin users, fleets and ops cars |
| Skeletons, empty/error states, persistent sidebar, mobile layout, data table, filtering, debounce, smart validation, destructive-action confirm, onboarding capture, autosave (partner application) | Already present | No change. Spot-checked every `variant="destructive"` button: all confirm or sit behind a reasons form |
| Bulk actions | Present where a real bulk endpoint exists (bulk VIN add, CSV listing import, mark all read) | No generic row selection added: approvals carry per-partner fees and identity checks, so bulk would be unsafe |
| Throttling | Buttons disable while their request runs; React Query dedupes reads | No change |
| Tier indicators, referral pages | Not applicable to staff and partner panels (the guest site has referrals) | No change |

**Verified**: `tsc --noEmit` in all 6 web apps; production `next build` of guest, admin, operations and partner apps; palette ranking checked with 6 cases; headless Chromium at 375 and 1280 px showed the offline and back-online banners with no sideways scroll. The browser check caught a real bug (error files must carry `'use client'` themselves), fixed before commit.
**Not verified**: the palette and the admin 404 in a signed-in browser session (needs staff login); there's no ESLint config in `frontend/`, so lint was not run.
**Rollback**: revert the commit; no data, API or config changes.

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
