# 02 — Backend Folder Structure

This is the complete backend tree with the **purpose of every folder and every
representative file**. The guiding idea: **vertical slicing**. Code is grouped by
*domain module*, not by technical type. You will not find a top-level `controllers/`
folder holding 40 unrelated controllers — that is the classic layered-monolith trap
that makes extraction impossible. Instead each module is a self-contained vertical
slice that could be lifted out wholesale.

## 2.1 Top-level layout

```
tura-backend/
├── src/
│   ├── main.ts                     # Composition root: build container, start HTTP+WS, wire graceful shutdown
│   ├── app.ts                      # Express app factory: mounts global middleware + module routers, NO server.listen
│   ├── server.ts                   # HTTP server + Socket.IO attach; used by main.ts and by tests
│   │
│   ├── config/                     # ⬇ typed, validated configuration (see 2.2)
│   ├── core/                       # ⬇ framework-agnostic building blocks shared by all modules (see 2.3)
│   ├── infrastructure/             # ⬇ concrete adapters to the outside world (see 2.4)
│   ├── shared/                     # ⬇ cross-cutting middleware, errors, utils, DI (see 2.5)
│   ├── modules/                    # ⬇ THE DOMAIN — one folder per bounded context (see 2.6)
│   ├── jobs/                       # ⬇ worker bootstrap: queues, workers, schedulers (see 2.7)
│   ├── realtime/                   # ⬇ Socket.IO gateway, namespaces, auth (see 2.8)
│   └── database/                   # ⬇ connection, migrations, seeders, indexes (see 2.9)
│
├── test/                           # integration & e2e tests (unit tests live beside code in modules)
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/                   # reusable factories/builders for test data
│   └── setup.ts                    # spins up in-memory Mongo + Redis, global hooks
│
├── scripts/                        # operational one-off scripts (backfills, data repair) — audited
├── docs/                           # this architecture set + OpenAPI output + ADRs
│   └── adr/                        # Architecture Decision Records (one file per decision)
│
├── .github/workflows/              # CI/CD pipelines (see 17)
├── docker/                         # Dockerfile(s), compose for local dev, entrypoints
│   ├── Dockerfile
│   ├── docker-compose.dev.yml
│   └── entrypoint.sh
├── ecosystem.config.js             # PM2 process definitions (api cluster + worker + scheduler)
├── .env.example                    # every env var documented; real .env is git-ignored & from secrets mgr
├── tsconfig.json                   # strict TypeScript config (see 19)
├── tsconfig.build.json             # build-only overrides (excludes tests)
├── package.json
├── .eslintrc.cjs / eslint.config.mjs
├── .prettierrc
├── jest.config.ts
└── openapi.yaml                    # generated API contract (source of truth for clients)
```

**Why `app.ts` has no `listen`:** separating app construction from process start lets
integration tests import the app and inject test doubles without opening a port, and
lets the same app be served by HTTP and (in future) serverless adapters.

---

## 2.2 `src/config/` — typed, validated configuration

Configuration is **loaded once, validated at boot, and frozen**. If a required env
var is missing or malformed, the process refuses to start (fail fast, never at 3am
under load).

```
config/
├── index.ts             # Aggregates & freezes all config; exported as a typed object
├── env.schema.ts        # Zod schema for process.env → parsed & type-narrowed
├── app.config.ts        # port, env name, base URLs, API version, request limits
├── database.config.ts   # Mongo URI, pool size, replica set, read preference
├── redis.config.ts      # connection(s): cache DB, queue DB, session DB (logical separation)
├── auth.config.ts       # JWT secrets/kids, TTLs, rotation window, OAuth client ids
├── aws.config.ts        # region, S3 buckets per purpose, KMS key ids
├── stripe.config.ts     # keys, webhook secrets, platform account id
├── maps.config.ts       # Google Maps keys (server-side, restricted), quotas
├── firebase.config.ts   # FCM service account ref (path/secret ref, never inline)
├── mail.config.ts       # SES/SMTP settings, from-addresses
├── sms.config.ts        # SMS provider creds, sender ids per region
├── queue.config.ts      # BullMQ defaults: attempts, backoff, concurrency per queue
└── feature-flags.config.ts # default flag values / provider config
```

**Why per-purpose Redis logical DBs:** cache eviction (LRU) must never evict a queued
job or an active session. We separate concerns by logical DB (or by dedicated
instances in prod) so a cache flush can never nuke sessions or jobs.

---

## 2.3 `src/core/` — framework-agnostic domain kernel

Zero dependencies on Express, Mongoose, Redis, or any vendor. Pure TypeScript. This
is what makes the domain testable in isolation and portable into a service later.

```
core/
├── domain/
│   ├── entity.base.ts          # Base entity: id (UUID), timestamps, equality by id
│   ├── aggregate-root.base.ts  # Aggregate root: buffers domain events until persisted
│   ├── value-object.base.ts    # VO base: immutability + structural equality
│   ├── domain-event.base.ts    # Event shape: name, aggregateId, occurredAt, payload, version
│   └── result.ts               # Result<T,E> type — explicit success/failure w/o throwing
├── types/
│   ├── pagination.ts           # OffsetPage / CursorPage generic types
│   ├── money.ts                # Money VO: integer minor units + currency (NEVER float)
│   ├── geo.ts                  # GeoPoint (lng,lat), BoundingBox, Distance
│   ├── ids.ts                  # Branded id types (UserId, VehicleId...) to prevent id mix-ups
│   └── common.ts               # ISODate, Nullable, DeepPartial helpers
├── errors/
│   ├── domain-error.base.ts    # Base for all business errors (code, httpStatus, safeMessage)
│   ├── not-found.error.ts
│   ├── conflict.error.ts       # e.g. double booking, optimistic-lock clash
│   ├── validation.error.ts
│   ├── forbidden.error.ts
│   └── external-service.error.ts
├── contracts/                  # ⭐ cross-module PUBLIC interfaces (the "APIs" between modules)
│   ├── vehicle.contract.ts     # what other modules may call on Vehicle (DTO in/out only)
│   ├── pricing.contract.ts
│   ├── payment.contract.ts
│   ├── notification.contract.ts
│   └── ...                      # one per module that exposes capabilities
└── events/
    ├── event-names.ts          # central enum/const of all domain event names (typo-proof)
    └── event-registry.ts       # maps event name → payload type (compile-time safety)
```

**Why `contracts/` lives in core, not in each module:** a contract is the *shared
language* between two modules. Putting the interface in `core/contracts` and the
implementation inside the module means a caller depends only on the abstraction
(Dependency Inversion — the "D" in SOLID). When the module becomes a service, we
swap the in-process implementation for an HTTP/gRPC client that satisfies the *same*
interface. **Not one call site changes.**

---

## 2.4 `src/infrastructure/` — concrete adapters

Every external system is wrapped behind an interface defined in `core` or the
consuming module. Modules depend on the interface; infrastructure provides the
implementation. This is the seam for testing (inject fakes) and for swapping vendors.

```
infrastructure/
├── database/
│   ├── mongoose.client.ts       # connection lifecycle, pool, health, graceful close
│   └── transaction.manager.ts   # withTransaction() wrapper over Mongo sessions
├── cache/
│   ├── redis.client.ts          # ioredis wrapper (cache DB)
│   ├── cache.service.ts         # get/set/del + get-or-load + tag-based invalidation
│   └── distributed-lock.ts      # Redlock-style mutex for critical sections (payouts, booking)
├── storage/
│   ├── s3.client.ts             # AWS SDK wrapper
│   └── s3.storage.service.ts    # presigned upload/download, per-purpose buckets, virus-scan hook
├── payment/
│   └── stripe.gateway.ts        # implements PaymentGateway interface from Payment module
├── maps/
│   └── google-maps.gateway.ts   # implements MapsProvider interface (distance, geocode, places)
├── notifications/
│   ├── fcm.provider.ts          # push
│   ├── ses.mail.provider.ts     # email
│   └── sms.provider.ts          # sms
├── search/
│   └── geo-search.adapter.ts    # Mongo 2dsphere now; swap to Elastic/Atlas Search later
├── queue/
│   └── bullmq.client.ts         # queue/worker factory bound to queue Redis DB
├── logging/
│   └── logger.ts                # pino instance, redaction rules, correlation-id binding
├── telemetry/
│   ├── metrics.ts               # prom-client registry + helpers
│   └── tracing.ts               # OpenTelemetry setup (traces across API→worker)
└── secrets/
    └── secrets.provider.ts      # abstracts AWS Secrets Manager / SSM; no secrets in env in prod
```

**Why wrap even Mongoose:** if we later move a module to a separate database or to
DynamoDB/Postgres, only the adapter changes. The module's repository interface stays.

---

## 2.5 `src/shared/` — cross-cutting application layer

```
shared/
├── di/
│   ├── container.ts             # DI container setup (tsyringe/awilix) — the composition wiring
│   └── tokens.ts                # injection tokens/symbols for interfaces
├── middleware/                  # reusable Express middleware (see 06 for the full pipeline)
│   ├── request-context.ts       # generates/propagates correlation id (AsyncLocalStorage)
│   ├── authenticate.ts          # verifies JWT, loads session, attaches principal
│   ├── authorize.ts             # policy/permission enforcement factory: authorize('booking:create')
│   ├── validate.ts              # runs a Zod DTO schema against body/query/params
│   ├── rate-limit.ts            # Redis-backed limiter factory (per-route configurable)
│   ├── idempotency.ts           # enforces Idempotency-Key on unsafe methods
│   ├── error-handler.ts         # central error → HTTP envelope translator (LAST in chain)
│   ├── not-found.ts             # 404 fallthrough
│   ├── response-formatter.ts    # wraps res.json into the standard envelope
│   ├── audit-log.ts             # records who-did-what for sensitive routes
│   ├── security-headers.ts      # helmet config + CSP
│   └── async-handler.ts         # wraps async controllers so rejections hit error-handler
├── http/
│   ├── api-response.ts          # success/fail envelope builders
│   ├── http-status.ts           # status code constants
│   └── controller.base.ts       # optional base with helpers (sendCreated, sendPaginated…)
├── validation/
│   ├── zod.helpers.ts           # common refinements (objectId, e164 phone, currency)
│   └── sanitize.ts              # XSS/NoSQL-injection input sanitization helpers
├── pagination/
│   ├── cursor.ts                # encode/decode opaque cursors (base64 of {sortKey,id})
│   └── paginate.ts              # generic offset & cursor pagination for repositories
├── events/
│   ├── event-bus.ts            # in-process pub/sub interface + impl (later: Kafka/Rabbit adapter)
│   └── outbox/
│       ├── outbox.model.ts      # transactional outbox collection
│       ├── outbox.repository.ts
│       └── outbox.relay.ts      # worker that publishes unsent outbox rows, marks sent
├── utils/
│   ├── uuid.ts                  # UUID v7 generation (time-sortable — great for indexes)
│   ├── crypto.ts                # hashing, HMAC, field encryption helpers (KMS-backed)
│   ├── date.ts                  # tz-safe date math (bookings span timezones!)
│   ├── phone.ts                 # E.164 normalization
│   ├── slug.ts
│   └── retry.ts                 # exponential backoff + jitter + circuit breaker helper
└── constants/
    ├── roles.ts
    ├── permissions.ts
    └── regex.ts
```

**Why an in-process EventBus *and* an Outbox:** the EventBus gives us decoupling now;
the Outbox gives us *reliability*. Emitting an event and committing DB state must be
atomic — otherwise a crash between them loses the event (booking created but no
confirmation email, forever). We write the event to an `outbox` collection **in the
same transaction** as the state change; a relay worker publishes it afterward. This
is the standard **Transactional Outbox** pattern and it is what makes the event
system safe to later back with Kafka.

---

## 2.6 `src/modules/` — the domain (vertical slices)

This is where the business lives. See [03-module-architecture.md](./03-module-architecture.md)
for the anatomy of a single module and the complete module list. Top level:

```
modules/
├── auth/
├── users/
├── hosts/
├── vehicles/
├── availability/
├── pricing/
├── search/
├── bookings/
├── trips/
├── payments/
├── wallet/
├── payouts/
├── subscriptions/
├── coupons/
├── referral/
├── reviews/
├── notifications/
├── maps/
├── documents/
├── media/
├── kyc/
├── insurance/
├── claims/
├── fleet/
├── corporate/
├── travel/
├── support/
├── analytics/
├── admin/
├── audit/
├── settings/
├── feature-flags/
└── _shared-kernel/     # tiny: types shared by 2+ modules that aren't infra (rare, reviewed)
```

Each of these is a folder with the identical internal structure defined in doc 03.

---

## 2.7 `src/jobs/` — the async worker plane

```
jobs/
├── index.ts             # worker process entrypoint (started as its own PM2 app)
├── queues.ts            # declares every queue with typed job payloads
├── scheduler.ts         # registers repeatable/cron jobs (BullMQ repeatable jobs)
├── workers/             # each worker binds a queue → a module service method
│   ├── notification.worker.ts
│   ├── payout.worker.ts
│   ├── media-processing.worker.ts
│   ├── invoice.worker.ts
│   ├── analytics-rollup.worker.ts
│   ├── calendar-sync.worker.ts
│   └── outbox-relay.worker.ts
└── crons/               # time-triggered orchestration (thin: enqueue jobs, don't do work)
    ├── daily-payout-run.cron.ts
    ├── booking-reminders.cron.ts
    ├── expire-pending-bookings.cron.ts
    └── kyc-reverification.cron.ts
```

**Why crons only enqueue:** a cron that does heavy work directly is unscalable and
un-retriable. Crons *fan out* into queued jobs so work is distributed, retried, and
observable like any other job.

---

## 2.8 `src/realtime/` — Socket.IO gateway

```
realtime/
├── index.ts                 # attaches Socket.IO to HTTP server, wires Redis adapter
├── socket.auth.ts           # handshake auth: verify JWT, bind principal to socket
├── namespaces/
│   ├── trip.namespace.ts     # live trip status + driver location
│   ├── chat.namespace.ts     # guest↔host messaging
│   └── notifications.namespace.ts  # real-time in-app notifications
├── presence/
│   └── presence.service.ts   # who's online, device rooms, multi-device fan-out (Redis)
├── emitters/
│   └── realtime.emitter.ts   # server-side API used by services/workers to push to clients
└── events.ts                 # typed client↔server event contracts
```

**Why an `emitter` abstraction:** services and workers must push realtime updates
without importing Socket.IO. They call `realtimeEmitter.toUser(id, event, payload)`;
the emitter uses the Redis adapter so it works across all API instances. When
realtime becomes its own service, only the emitter's transport changes.

---

## 2.9 `src/database/`

```
database/
├── connection.ts        # re-exports infra mongoose client, exposes readiness probe
├── migrations/          # ordered, reversible schema/data migrations (migrate-mongo)
│   └── 20260101_0001_init_indexes.ts
├── indexes/             # index definitions per collection, applied on deploy (idempotent)
├── seeders/             # dev/staging seed data (roles, permissions, feature flags, demo)
└── transaction.ts       # re-export of transaction manager for module use
```

**Why explicit migrations even on MongoDB:** "schemaless" is a lie in production. We
enforce shape via Mongoose + validation, and index changes / data backfills must be
versioned, reviewed, reversible, and run in CI — never applied by hand.
