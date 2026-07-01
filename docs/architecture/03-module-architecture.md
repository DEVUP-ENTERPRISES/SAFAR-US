# 03 — Module Architecture

## 3.1 The anatomy of a module

Every module is a **vertical slice** with the same internal structure. Uniformity is
a feature: any engineer can open any module and know exactly where things are. This
is also what makes extraction mechanical — a module is already shaped like a service.

Using `bookings` as the canonical example:

```
modules/bookings/
├── bookings.module.ts         # Module manifest: registers routes, DI bindings, event subs, jobs
│
├── api/                       # ── INBOUND ADAPTER (HTTP) ──
│   ├── bookings.controller.ts # Thin: parse req → call service → format res. NO business logic.
│   ├── bookings.routes.ts     # Route table + per-route middleware (authz, validation, rate limit)
│   └── bookings.presenter.ts  # Maps domain/DTO → API response shape (versioned view models)
│
├── application/               # ── USE CASES / ORCHESTRATION (Service Layer) ──
│   ├── booking.service.ts     # Orchestrates use cases; owns transactions; emits events
│   ├── use-cases/             # (optional split when service grows) one file per use case
│   │   ├── create-booking.usecase.ts
│   │   ├── confirm-booking.usecase.ts
│   │   ├── cancel-booking.usecase.ts
│   │   └── extend-booking.usecase.ts
│   └── booking.policy.ts      # Authorization policies specific to bookings (can user X act on Y?)
│
├── domain/                    # ── PURE DOMAIN (no framework, no I/O) ──
│   ├── booking.entity.ts      # Aggregate root: invariants, state transitions, guards
│   ├── booking-status.enum.ts # The status enum + allowed-transition map
│   ├── booking.events.ts      # Domain events this module emits (payload types)
│   └── value-objects/
│       ├── rental-period.vo.ts  # start/end + validity (end>start, min/max duration)
│       └── booking-amount.vo.ts # Money breakdown VO
│
├── infrastructure/            # ── OUTBOUND ADAPTERS (persistence) ──
│   ├── booking.model.ts       # Mongoose schema/model (persistence shape ONLY)
│   ├── booking.repository.ts  # Implements the repo interface; the only code touching the model
│   └── booking.mapper.ts      # Maps persistence model ↔ domain entity (anti-corruption)
│
├── contracts/                 # ── PUBLIC INTERFACE (what OTHER modules may call) ──
│   ├── booking.contract.ts    # Interface + DTOs exposed to other modules (impl by service)
│   └── booking.repository.interface.ts
│
├── dto/                       # Data Transfer Objects (request/response/inter-module)
│   ├── create-booking.dto.ts
│   ├── booking-response.dto.ts
│   └── booking-query.dto.ts
│
├── validators/                # Zod schemas for inbound payloads (used by validate middleware)
│   ├── create-booking.schema.ts
│   └── list-bookings.schema.ts
│
├── events/                    # Event SUBSCRIPTIONS (this module reacting to others' events)
│   └── payment-succeeded.handler.ts  # e.g. mark booking paid when PaymentSucceeded fires
│
├── jobs/                      # Job definitions owned by this module
│   └── expire-pending-booking.job.ts
│
├── cron/                      # Schedules owned by this module (thin; enqueue jobs)
│   └── expire-pending.cron.ts
│
├── constants/
│   └── booking.constants.ts   # timeouts, limits, hold durations
│
├── types/
│   └── booking.types.ts       # internal types not exposed as contracts
│
├── utils/
│   └── booking.calculations.ts
│
├── errors/
│   └── booking.errors.ts      # BookingNotFound, DoubleBooking, IllegalTransition…
│
└── __tests__/
    ├── booking.service.spec.ts     # unit (services with mocked repos/contracts)
    ├── booking.entity.spec.ts      # unit (pure domain: transitions & invariants)
    └── bookings.integration.spec.ts# integration (real Mongo, module boundary)
```

### The dependency rule (Clean Architecture)
Dependencies point **inward only**:

```
api → application → domain
        ↑                ↑
   infrastructure   (implements interfaces defined inward)
```

- `domain` depends on **nothing**. It is pure business rules.
- `application` depends on `domain` and on **contract interfaces** (never concrete infra).
- `api` and `infrastructure` are **adapters** at the edges; they depend inward.
- Concrete infra (Mongoose model, Stripe gateway) is injected at runtime via DI.

This is the Dependency Inversion Principle applied structurally. The payoff: you can
unit-test `booking.service.ts` with fake repositories and fake payment gateways, with
zero database, in milliseconds — and you can replace MongoDB or Stripe without
touching business logic.

### What each layer may and may not do

| Layer | May | May NOT |
|---|---|---|
| **Controller (api)** | parse/validate HTTP, call one service method, format response | contain business rules, touch DB, call other modules |
| **Service (application)** | orchestrate, open transactions, call repos + contracts, emit events | know about HTTP (`req`/`res`), build SQL/Mongo queries directly |
| **Domain (entity/VO)** | enforce invariants, state transitions | do I/O, import Mongoose/Express, know about persistence |
| **Repository (infra)** | build queries, map model↔entity | contain business decisions, call other modules |

---

## 3.2 How modules communicate (the boundary contract)

There are exactly **three legal ways** for Module A to interact with Module B:

1. **Synchronous query/command via contract interface.** A depends on
   `IPricingContract` (defined in `core/contracts` or B's `contracts/`). At startup,
   DI binds it to Pricing's service. A calls `pricing.quote(dto)` and gets a DTO
   back. A never imports Pricing's repository, model, or entity.

2. **Asynchronous domain event.** A emits `BookingConfirmed` to the EventBus (via the
   Outbox). B subscribes in its `events/` folder. A does not know B exists. Used when
   the reaction is a *side effect* and eventual consistency is acceptable (send
   notification, update analytics, decrement availability cache).

3. **Never:** direct import of B's internal classes, or reading/writing B's
   collections. This is caught by an ESLint boundary rule (see below) and rejected in
   code review.

### Enforcing boundaries mechanically
We use an ESLint import-boundary rule (e.g. `eslint-plugin-boundaries` /
`import/no-restricted-paths`):

- A module folder may import from: its own subtree, `core/`, `shared/`,
  `infrastructure/` (interfaces only), and **other modules' `contracts/` only**.
- Importing `modules/X/infrastructure/**` or `modules/X/domain/**` from module `Y` is
  a **build failure**. The boundary is not a guideline; it is compiled.

### Choosing sync vs. event
- **Sync (contract)** when the caller *needs the result now* to proceed (price to show
  the user, availability to allow a booking, payment intent to charge).
- **Event** when the caller is *done* and others should react (notifications, search
  index update, analytics, wallet credit). Prefer events — they reduce coupling and
  are the natural microservice boundary.

---

## 3.3 The module manifest (`*.module.ts`)

Each module exposes a single manifest that the composition root consumes. It declares:

- **Router** — the Express router to mount at `/api/v1/<resource>`.
- **DI bindings** — which concrete classes satisfy which interface tokens.
- **Event subscriptions** — `{ eventName → handler }` this module listens to.
- **Job processors** — which queues/workers this module owns.
- **Contract export** — the public interface instance other modules receive via DI.

Because everything a module offers and needs is declared in one manifest, deleting or
extracting a module is a bounded operation: remove its manifest registration,
re-point its contract binding to a remote client. Doc 18 details this.

---

## 3.4 The complete module catalog

Grouped by domain area, with responsibility and key contracts. Every module has the
folder structure from 3.1.

### Identity & Access
| Module | Owns | Emits (key events) | Exposes (contract) |
|---|---|---|---|
| **auth** | login, tokens, sessions, OTP, OAuth, refresh rotation | `UserLoggedIn`, `SuspiciousLoginDetected` | `verifyToken`, `issueTokens`, `revokeSession` |
| **users** | user profiles, preferences, devices, roles assignment | `UserRegistered`, `UserRoleChanged` | `getUser`, `getUsersByIds`, `assertUserExists` |
| **hosts** | host onboarding, host profile, payout account link | `HostOnboarded`, `HostSuspended` | `getHost`, `isHostVerified` |
| **kyc** | identity verification workflow & status | `KycSubmitted`, `KycApproved`, `KycRejected` | `getKycStatus`, `requireVerified` |

### Supply (the asset)
| Module | Owns | Emits | Exposes |
|---|---|---|---|
| **vehicles** | vehicle core entity, listings, docs linkage, verification | `VehicleListed`, `VehicleVerified`, `VehicleDelisted` | `getVehicle`, `getVehicleForBooking`, `isBookable` |
| **availability** | availability calendar, blocks, holds | `AvailabilityBlocked`, `HoldPlaced`, `HoldReleased` | `checkAvailability`, `placeHold`, `confirmHold` |
| **pricing** | base/seasonal/dynamic pricing, price quotes | `PriceRuleChanged` | `quote(vehicle, period, promo)` |
| **media** | image/video upload, transcoding, CDN URLs | `MediaProcessed` | `attachMedia`, `getSignedUrl` |
| **documents** | doc storage/verification (licenses, insurance, RC) | `DocumentUploaded`, `DocumentVerified` | `getDocument`, `verifyDocument` |

### Demand & fulfillment
| Module | Owns | Emits | Exposes |
|---|---|---|---|
| **search** | geo/filter/rank of listings | — (read-mostly) | `searchVehicles`, `nearby` |
| **bookings** | reservation lifecycle & state machine | `BookingCreated/Confirmed/Cancelled/Expired` | `getBooking`, `createBooking` |
| **trips** | active rental: handover, live status, return, odometer | `TripStarted`, `TripCompleted`, `TripLocationUpdated` | `getTrip`, `startTrip`, `completeTrip` |

### Money
| Module | Owns | Emits | Exposes |
|---|---|---|---|
| **payments** | Stripe intents, charges, refunds, webhooks | `PaymentSucceeded/Failed/Refunded` | `createIntent`, `capture`, `refund` |
| **wallet** | user wallet balances (as ledger views) | `WalletCredited`, `WalletDebited` | `getBalance`, `credit`, `debit` |
| **payouts** | host payout scheduling & execution | `PayoutScheduled`, `PayoutPaid`, `PayoutFailed` | `schedulePayout`, `getPayoutStatus` |
| **subscriptions** | recurring plans (host pro, fleet SaaS, corp) | `SubscriptionStarted/Renewed/Cancelled` | `getSubscription`, `hasEntitlement` |
| **coupons** | promo codes, discounts, validity rules | `CouponRedeemed` | `validateCoupon`, `redeem` |
| **referral** | referral codes, attribution, rewards | `ReferralConverted` | `attribute`, `grantReward` |

### Trust & safety
| Module | Owns | Emits | Exposes |
|---|---|---|---|
| **reviews** | ratings & reviews (both directions), aggregates | `ReviewPosted` | `getRating`, `canReview` |
| **insurance** | insurance products, coverage per booking | `CoverageBound` | `bindCoverage`, `getCoverage` |
| **claims** | damage/incident claims workflow & docs | `ClaimOpened`, `ClaimResolved` | `openClaim`, `getClaim` |
| **support** | tickets, disputes, agent tooling | `TicketOpened`, `TicketResolved` | `openTicket` |
| **audit** | append-only audit log of sensitive actions | — | `record`, `query` (admin) |

### Platform & ops
| Module | Owns | Emits | Exposes |
|---|---|---|---|
| **notifications** | multi-channel delivery, templates, prefs | `NotificationSent/Failed` | `send`, `sendTemplated` |
| **maps** | geocode, distance, places, directions (cached) | — | `geocode`, `distanceMatrix`, `autocomplete` |
| **analytics** | event ingestion, rollups, dashboards feed | — | `track`, `getMetric` |
| **admin** | back-office orchestration over other modules | — | (BFF; calls contracts) |
| **settings** | user/system/tenant settings | `SettingChanged` | `getSetting`, `setSetting` |
| **feature-flags** | flag evaluation, targeting, rollouts | `FlagChanged` | `isEnabled(flag, ctx)` |

### Future business lines (scaffolded, built when prioritized)
| Module | Owns | Depends on |
|---|---|---|
| **fleet** | bulk vehicle ops, utilization, driver assignment, fleet dashboards | vehicles, bookings, availability, analytics |
| **corporate** | orgs, cost centers, travel policy, approval chains, consolidated invoicing | bookings, payments, subscriptions, users |
| **travel** | bundles (car+stay), itineraries, cross-sell | bookings, search, maps |

**Design note on future modules:** we do **not** build these now. But we *reserve
their boundaries* — their contract interfaces are stubbed so that current modules
never accidentally implement corporate/fleet logic inline. When we build `corporate`,
`bookings` already emits the events `corporate` needs (`BookingConfirmed` carries
enough context), so no retrofit is required.

---

## 3.5 Dependency direction between modules (no cycles allowed)

Modules form a **directed acyclic graph**. A cycle (A needs B needs A) is a design
smell and a hard extraction blocker; it is rejected in review. General flow:

```
auth → users → hosts
users → kyc
vehicles → availability, pricing, media, documents
search → vehicles, availability, pricing        (read side)
bookings → vehicles(contract), availability, pricing, payments, insurance
trips → bookings
payments → wallet(via events), coupons(contract)
payouts → payments(ledger), bookings(events)
reviews → bookings(events)
claims → trips, insurance, documents
notifications ← (everything, via EVENTS only — no one depends on it synchronously
                except through the fire-and-forget contract)
analytics ← (everything, via EVENTS only)
audit ← (everything, via events / middleware)
admin → * (contracts only; it is a Backend-for-Frontend over other modules)
```

Where a would-be cycle appears, we break it with an **event** (async, one-directional)
instead of a synchronous call. Example: `payments` must not synchronously call
`bookings`; instead it emits `PaymentSucceeded` and `bookings` reacts.
