# 01 — System Overview

## 1.1 The platform, not the app

TURA is composed of **clients**, an **API edge**, a **modular monolith core**, an
**async processing plane**, and **stateful backing services**. The mental model:

```
                          ┌────────────────────────────────────────────┐
                          │                 CLIENTS                      │
                          │  Flutter App (iOS/Android) · Admin Web (React)│
                          │  Future: Corporate Portal · Fleet SaaS Web    │
                          └───────────────┬──────────────────────────────┘
                                          │ HTTPS / WSS
                                          ▼
                          ┌──────────────────────────────┐
                          │        Cloudflare (CDN/WAF)   │  DDoS, TLS, caching, bot mgmt
                          └───────────────┬──────────────┘
                                          ▼
                          ┌──────────────────────────────┐
                          │        NGINX (reverse proxy)  │  TLS term, LB, rate hints, gzip
                          └───────────────┬──────────────┘
                                          ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │              NODE.JS / EXPRESS  (Modular Monolith, PM2 cluster)   │
        │  ┌───────────┐  Middleware Pipeline  ┌──────────────────────────┐ │
        │  │  HTTP API │──(helmet→cors→...)────▶│  MODULES (vertical slices)│ │
        │  │  /api/v1  │                        │  auth users vehicles ... │ │
        │  └───────────┘                        └──────────────────────────┘ │
        │  ┌───────────┐                        ┌──────────────────────────┐ │
        │  │ Socket.IO │◀──────────────────────▶│  Realtime Gateway         │ │
        │  └───────────┘                        └──────────────────────────┘ │
        │           │  publishes Domain Events / enqueues Jobs                │
        └───────────┼───────────────────────────────────────────────────────┘
                    ▼
        ┌───────────────────────────────┐     ┌──────────────────────────────┐
        │  BullMQ Workers (separate PM2) │     │  Cron / Scheduler workers     │
        │  notifications, payouts, media │     │  payout runs, calendar sync   │
        └───────────────┬───────────────┘     └───────────────┬──────────────┘
                        ▼                                      ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  STATEFUL SERVICES                                                    │
        │  MongoDB (replica set)  ·  Redis (cache/queue/sessions/locks)         │
        │  AWS S3 (documents/media)                                             │
        └────────────────────────────────────────────────────────────────────┘

        EXTERNAL: Stripe · Google Maps · Firebase (FCM) · SMS gateway · Email(SES)
```

### Why a separate worker plane from day one
The API process must stay **latency-focused and stateless**. Anything that is slow,
retriable, or must survive a request timeout (sending email, generating invoices,
processing payouts, transcoding video, syncing calendars, computing analytics) runs
in **BullMQ workers deployed as separate PM2 processes**. This is the single most
important scalability decision at the process level: **the web tier and the work
tier scale independently**. A payout batch job storm never degrades booking latency.

---

## 1.2 Product surfaces and how the architecture absorbs them

Each future business line maps onto the same core primitives — **Actors, Assets,
Availability, Bookings, Money, Trust**. We do not build a new backend per business
line; we add modules and *policies* on top of shared primitives.

| Future surface | Reuses | Adds |
|---|---|---|
| **P2P marketplace (v1)** | Users, Vehicles, Bookings, Payments, Reviews | — |
| **Corporate Mobility** | Bookings, Payments, Vehicles | `Corporate` module: orgs, cost centers, policy-based approval, invoicing |
| **Fleet Management** | Vehicles, Bookings, Maintenance | `Fleet` module: bulk ops, utilization, driver assignment |
| **Vehicle Marketplace (buy/sell)** | Vehicles, Media, Payments | `Marketplace` module: listings-for-sale, offers, escrow |
| **Travel Ecosystem** | Bookings, Search, Maps | `Travel` module: bundles (stay+car), itineraries |
| **EV Ecosystem** | Vehicles, Trips, Maps | charging stations, battery/range telemetry, energy pricing |
| **Creator Marketplace** | Users, Media, Vehicles | creator profiles, affiliate/referral, content |
| **Fleet SaaS** | Fleet, Analytics, RBAC | white-label tenancy, per-tenant billing (Subscriptions) |
| **Vehicle Financing** | Users(KYC), Payments, Ledger | loan products, underwriting, repayment schedules |
| **Investment Platform** | Ledger, Payments, Vehicles | fractional ownership, yield distribution, statements |

**Design implication:** the domain model must treat "a vehicle can be rented, sold,
financed, fractionally owned, or fleet-managed" as *different lifecycles over the
same asset*, not as different asset types. We model this with a `Vehicle` core
entity plus **capability/listing records** that attach purposes to it. See
[10-vehicle-module.md](./10-vehicle-module.md).

**AI-ready** means: every meaningful action emits a structured **domain event** into
an append-only stream, and every entity carries clean, typed, normalized data. This
event log + normalized store is the substrate for future ML (dynamic pricing, fraud
detection, demand forecasting, recommendations) without re-instrumenting the app.

---

## 1.3 The five planes

1. **Edge plane** — Cloudflare + NGINX. TLS, DDoS, WAF, geo-routing, static caching,
   compression. Nothing business-logical lives here.
2. **API plane** — Express modular monolith, stateless, horizontally scalable behind
   the load balancer. Handles synchronous request/response.
3. **Realtime plane** — Socket.IO, sticky sessions via Redis adapter. Presence,
   location streaming, chat, live trip status.
4. **Async plane** — BullMQ workers + cron. Everything eventual: notifications,
   payouts, media processing, analytics rollups, calendar sync, retries.
5. **State plane** — MongoDB (source of truth), Redis (ephemeral/coordination), S3
   (blobs). External SaaS (Stripe/Maps/FCM) are treated as untrusted, rate-limited,
   circuit-broken dependencies behind adapter interfaces.

---

## 1.4 Non-negotiable cross-cutting principles

- **Statelessness of the API tier.** No in-process session state. Sessions live in
  Redis, files in S3. Any instance can serve any request → trivial horizontal scale.
- **Idempotency for every money-touching or externally-visible mutation.** Clients
  send `Idempotency-Key`; we dedupe in Redis + persist result.
- **Money is never a float and never lives in a mutable field.** All value movement
  is an append-only double-entry ledger (see [11](./11-payment-engine.md)).
- **Events over direct coupling.** When Module A's action should trigger Module B's
  behavior, A emits an event; B subscribes. A does not know B exists.
- **Fail closed on authz, fail open on non-critical enrichment.** A missing
  permission denies; a slow "recommendations" call degrades gracefully.
- **Everything observable.** Structured logs with correlation IDs, metrics, traces.
  If we cannot see it, it does not exist in production.

---

## 1.5 Request lifecycle (happy path, synchronous)

1. Client sends `POST /api/v1/bookings` with JWT + `Idempotency-Key`.
2. Cloudflare → NGINX → an Express instance.
3. Middleware pipeline runs (see [06](./06-middleware-pipeline.md)): request-id,
   helmet, cors, body parse, rate-limit, auth (verify JWT), load session, RBAC
   policy check, DTO validation, idempotency guard.
4. Controller translates HTTP → a service call with a typed DTO.
5. `BookingService` orchestrates: checks availability (Vehicle module **interface**),
   computes price (Pricing module **interface**), creates a `PaymentIntent`
   (Payment module **interface**), persists booking via `BookingRepository` inside a
   transaction, writes an **outbox** row `BookingCreated`.
6. Response wrapper formats a consistent envelope; response returns.
7. Outbox relay publishes `BookingCreated` → Notification worker sends push/email;
   Analytics worker updates counters; Realtime gateway pushes status to host.

No synchronous work waits on notifications, analytics, or host devices. The user
gets a fast, deterministic response; side effects happen asynchronously and
reliably.
