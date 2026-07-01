# TURA — Mobility Operating System

**Company:** DevUp Ecosystem Pvt Ltd
**Project:** TURA
**Document type:** Internal Engineering Blueprint (Production Architecture)
**Status:** Foundational v1 — Modular Monolith → Service-Extractable

---

## What this document set is

This is the canonical architecture blueprint for TURA. It is written for engineers
who will build, operate, and later decompose this system. It deliberately avoids
application code. It describes **structure, boundaries, contracts, data, and
operational design** — the decisions that are expensive to change later.

TURA is **not** a car-rental app. It is an **AI-ready Mobility Operating System**.
The peer-to-peer (P2P) vehicle marketplace (Turo-style) is only the **first surface**
on top of a platform engineered to absorb: Corporate Mobility, Fleet Management,
Vehicle Marketplace, Travel Ecosystem, EV Ecosystem, Creator Vehicle Marketplace,
Fleet SaaS, Vehicle Financing, and a Vehicle Investment Platform.

The architecture's single most important property: **the P2P marketplace must not
bake in assumptions that block those futures.** Everything below is in service of
that.

---

## The core architectural thesis

> **Build a Production-Grade Modular Monolith with hard internal boundaries, so that
> each module is a microservice in everything but deployment — and can be physically
> extracted with localized, mechanical changes when scale or org structure demands
> it.**

We are **not** doing microservices on day one. Distributed systems impose a heavy
tax — network partitions, distributed transactions, eventual consistency bugs,
operational sprawl, 20 CI/CD pipelines — that a pre-product-market-fit startup
cannot afford and does not need. But we are also **not** building a "big ball of
mud." We get the team velocity of a monolith with the *boundary discipline* of
microservices.

We achieve this through three rules enforced in code review and tooling:

1. **Modules talk through contracts, never through each other's internals.**
   Module A may call Module B only via B's public service interface or by emitting
   a domain event. A may never import B's repository, model, or reach into B's
   collections.
2. **Every cross-module call is already shaped like a network call.** Service
   interfaces use DTOs in and DTOs out. No leaking of Mongoose documents across a
   module edge. The day we put HTTP/gRPC between two modules, the call sites do not
   change shape.
3. **Each module owns its data.** No module reads or writes another module's
   collections directly. This is what makes "give this module its own database
   later" a configuration change rather than a rewrite.

See [18-microservices-migration.md](./18-microservices-migration.md) for the exact
extraction playbook.

---

## Document index

| # | Document | Purpose |
|---|----------|---------|
| 00 | [README.md](./README.md) | This file — thesis, index, conventions |
| 01 | [01-system-overview.md](./01-system-overview.md) | High-level system, components, data flow, product surfaces |
| 02 | [02-backend-folder-structure.md](./02-backend-folder-structure.md) | Complete backend tree, every folder & file purpose |
| 03 | [03-module-architecture.md](./03-module-architecture.md) | The anatomy of a module; full module list & dependencies |
| 04 | [04-database-design.md](./04-database-design.md) | MongoDB schema design, collections, indexes, relationships |
| 05 | [05-api-structure.md](./05-api-structure.md) | REST conventions, versioning, resource map |
| 06 | [06-middleware-pipeline.md](./06-middleware-pipeline.md) | The request lifecycle, every middleware in order |
| 07 | [07-rbac.md](./07-rbac.md) | Roles, permissions, the permission matrix, policy engine |
| 08 | [08-security.md](./08-security.md) | Auth, tokens, encryption, secrets, attack mitigation |
| 09 | [09-booking-engine.md](./09-booking-engine.md) | Booking & trip lifecycle, the state machine, money flows |
| 10 | [10-vehicle-module.md](./10-vehicle-module.md) | Listings, verification, availability, pricing calendars |
| 11 | [11-payment-engine.md](./11-payment-engine.md) | Stripe, payouts, commission, wallet, the ledger |
| 12 | [12-notification-engine.md](./12-notification-engine.md) | Multi-channel delivery, templates, queues, retries |
| 13 | [13-search-engine.md](./13-search-engine.md) | Geo search, filters, ranking, recommendations |
| 14 | [14-admin-panel.md](./14-admin-panel.md) | Admin/back-office architecture |
| 15 | [15-realtime.md](./15-realtime.md) | Socket.IO design, presence, location streaming, scaling |
| 16 | [16-mobile-app.md](./16-mobile-app.md) | Flutter app architecture (Clean Architecture) |
| 17 | [17-deployment-devops.md](./17-deployment-devops.md) | Infra, CI/CD, environments, observability |
| 18 | [18-microservices-migration.md](./18-microservices-migration.md) | How each module becomes a service |
| 19 | [19-coding-standards.md](./19-coding-standards.md) | TypeScript rules, patterns, DI, error model |
| 20 | [20-performance.md](./20-performance.md) | Caching, pagination, indexing, jobs, optimization |

---

## Reading order

- **Founders / PMs:** 01, 09, 11, 14.
- **Backend engineers (new joiner):** 00 → 02 → 03 → 19 → 06 → 04, then domain docs.
- **Mobile engineers:** 16, 05, 15.
- **DevOps / SRE:** 17, 20, 15, 08.
- **Anyone proposing a new module:** 03 (module anatomy) is mandatory.

---

## Glossary (used throughout)

- **Host** — a user who lists one or more vehicles for rent.
- **Guest / Renter** — a user who books a vehicle.
- **Trip** — the active rental period of a confirmed booking (handover → return).
- **Booking** — the commercial reservation; precedes and contains the Trip.
- **Module** — a vertically-sliced domain with its own controllers→services→repos.
- **Domain Event** — an immutable fact ("BookingConfirmed") published to a bus.
- **Ledger** — the append-only, double-entry record of all money movement.
- **Idempotency Key** — client/server token that makes a mutation safe to retry.
- **Outbox** — a DB table that guarantees events are published exactly once.
