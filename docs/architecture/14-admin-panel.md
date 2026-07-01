# 14 — Admin Panel Architecture

## 14.1 What the admin panel is (and isn't)

The admin panel is a **separate frontend application** (React/Next.js web) talking to
the **same backend** under `/api/v1/admin/*`, gated by admin roles (doc 07) and fully
audited (doc 08). It is **not** a separate backend. The `admin` module is a
**Backend-for-Frontend (BFF)**: it orchestrates other modules **via their contracts**
(never their internals), aggregating data for back-office views and exposing
privileged operations.

**Why a BFF module rather than admin logic scattered in each module:** admin views
are cross-cutting (a "user 360" pulls users + bookings + payments + claims). Putting
that composition in a dedicated module keeps domain modules clean and keeps admin's
elevated, audited operations in one governed place.

## 14.2 Frontend architecture (admin web)

```
admin-web/
├── src/
│   ├── app/                # routes (Next.js app router) per section
│   ├── features/           # feature-sliced: users, hosts, vehicles, bookings, payments...
│   │   └── <feature>/{api, components, hooks, types}
│   ├── shared/             # design system, data-table, filters, auth guard, api client
│   ├── lib/                # api client (generated from OpenAPI), rbac helpers
│   └── stores/             # server-state via React Query; minimal client state
```
- **Server-state via React Query** (caching, pagination, optimistic updates); avoid a
  heavy global store — most admin state is server data.
- **Generated API client** from the backend OpenAPI spec → no drift, typed end to end.
- **RBAC-aware UI:** the panel renders only actions the principal's permissions allow
  (the server still enforces — UI hiding is convenience, not security).

## 14.3 Sections & capabilities

| Section | Reads | Privileged actions (audited) |
|---|---|---|
| **Dashboard** | live KPIs: GMV, bookings, active trips, new users/hosts, conversion, payout liability | — |
| **Analytics** | cohorts, funnels, supply/demand heatmaps, revenue, churn | export reports |
| **Users** | user 360 (profile, bookings, payments, reviews, tickets) | suspend/ban, reset, impersonate (audited, consent-gated), adjust roles |
| **Hosts** | host quality, earnings, listings, verification queue | verify/reject host, suspend, adjust payout schedule |
| **Vehicles** | listing + doc verification queue, flags | verify/reject, delist, remove media |
| **Bookings/Trips** | search bookings, timelines, disputes | cancel-on-behalf, force-refund (finance), resolve dispute |
| **Payments** | transactions, reconciliation status, refunds | issue refund (finance), retry failed |
| **Payouts** | schedule, failures, liability | trigger payout run, retry, hold |
| **Claims** | claim queue, evidence, timelines | assign, approve/reject, settle |
| **Support** | ticket queue, SLAs | respond, escalate, merge |
| **Coupons/Promos** | campaigns, redemption | create/expire coupons |
| **Feature Flags** | flag states, rollout % | toggle, target cohorts, kill-switch |
| **Settings** | system/tenant settings | edit (dev/super), commission/tax config (finance) |
| **Audit Logs** | full action history, filter by actor/resource | export (compliance) |

## 14.4 Operational queues (the real workhorses)

Back-office is queue-driven. Verification, claims, and support are **work queues** with
assignment, SLA timers, and status — surfaced to the right role:
- **Ops Admin:** vehicle/host verification, KYC review queues.
- **Finance Admin:** refund requests, failed payouts, reconciliation exceptions.
- **Support Agent:** tickets/disputes with SLA.
- **Moderator:** flagged reviews/content, reported users.

Each queue reads via contracts and acts via privileged contract methods, every action
writing an `audit_logs` entry with before/after.

## 14.5 Impersonation & sensitive actions

- **Impersonation** (view-as-user for support) is time-boxed, permission-gated,
  loudly audited, and never allows password/payment-method changes. It exists because
  support effectiveness demands it, but it is one of the most abused capabilities — so
  it is the most tightly controlled.
- **Break-glass** (Super Admin full access) requires MFA and generates high-priority
  audit + alert.
- **Four-eyes on money:** large refunds/payout overrides can require a second
  approver (configurable) — separation of duties.

## 14.6 Dashboard/analytics data path

Admin dashboards **do not** run heavy aggregations against the live transactional DB on
each page load (that would compete with user traffic). Instead:
- The **analytics module** consumes domain events and maintains **precomputed rollups**
  (daily GMV, bookings by status/region, cohort tables) via scheduled jobs, stored in
  analytics collections + cached in Redis.
- Dashboards read these rollups → fast, and isolated from OLTP load.
- Heavy/ad-hoc analytics later move to a warehouse (events streamed to
  BigQuery/Redshift) — the event substrate already exists, so this is additive.

## 14.7 Why this structure is future-proof

- As **Fleet SaaS / Corporate** arrive, the same admin shell adds **tenant-scoped**
  views (a fleet manager sees only their fleet) using the RBAC `scope` dimension —
  even a white-label tenant admin is the same BFF with a `tenantId` filter.
- Because admin only touches modules via contracts, extracting any module to a service
  leaves the admin panel working (it just calls a remote contract implementation).
