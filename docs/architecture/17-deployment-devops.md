# 17 — Deployment & DevOps

## 17.1 Topology (production)

```
                 ┌─────────────────────────────┐
   Users ───────▶│  Cloudflare (DNS, CDN, WAF)  │  TLS, DDoS, bot mgmt, static/media caching
                 └──────────────┬──────────────┘
                                ▼
                 ┌─────────────────────────────┐
                 │  NGINX (reverse proxy / LB)  │  TLS term, upstream LB, gzip, sticky WS
                 └──────────────┬──────────────┘
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                         ▼
  ┌───────────┐          ┌───────────┐            ┌──────────────┐
  │ API node  │  ...      │ API node  │            │ Worker node  │  (BullMQ workers + cron/scheduler)
  │ PM2 cluster│          │ PM2 cluster│            │ PM2          │
  └─────┬─────┘          └─────┬─────┘            └──────┬───────┘
        └───────────┬──────────┘                        │
                    ▼                                    ▼
          ┌──────────────────────────────────────────────────────┐
          │  MongoDB replica set (PSA)  ·  Redis (cache/queue/sess) │
          └──────────────────────────────────────────────────────┘
          External: AWS S3, Stripe, Google Maps, FCM, SES, SMS
```

- **API and Worker are separate deployables** (separate PM2 apps / EC2 groups) so the
  web tier and the async tier scale and fail independently (doc 01).
- **MongoDB replica set** (Primary-Secondary-Arbiter minimum) from day one — required
  for multi-document transactions (booking engine) and for HA/failover. Managed
  **MongoDB Atlas** is the recommended path (backups, scaling, monitoring, automated
  failover) over self-managed.
- **Redis** managed (ElastiCache) or self-hosted with persistence; logically separated
  DBs for cache / queue / sessions (doc 02 §2.2).

## 17.2 Process management (PM2)

`ecosystem.config.js` defines:
- `tura-api`: cluster mode, `instances: max` (one per CPU core), graceful reload
  (zero-downtime) on deploy, memory-restart guard.
- `tura-worker`: the BullMQ worker process (fork/cluster as needed per queue load).
- `tura-scheduler`: single instance owning cron/repeatable jobs (avoids duplicate cron
  firing — schedulers must be singletons).

**Graceful shutdown** is wired in `main.ts`: on SIGTERM, stop accepting new
connections, drain in-flight requests, close Mongo/Redis/queue connections, exit —
so deploys and autoscaling don't drop requests or corrupt jobs.

## 17.3 Containerization

- **Docker** multi-stage build: builder stage compiles TypeScript; runtime stage is a
  slim Node image with only `dist/` + production deps → small, secure image.
- `docker-compose.dev.yml` spins up app + Mongo + Redis + (localstack S3) for
  one-command local dev parity.
- Same image runs API or Worker (entrypoint/command selects role) → build once,
  deploy as either.

## 17.4 Environments

| Env | Purpose | Data | Deploy trigger |
|---|---|---|---|
| **local** | dev machine | seeded/fake | manual (compose) |
| **staging** | pre-prod mirror | anonymized/synthetic | merge to `develop` |
| **production** | live | real | tagged release / merge to `main` (with approval) |

Each env has isolated secrets (Secrets Manager), buckets, Stripe keys (test vs live),
and Maps/FCM projects. **Config is per-env; code is identical** — the twelve-factor
principle.

## 17.5 CI/CD (GitHub Actions)

**CI (every PR):**
1. install (cached) → typecheck (`tsc --noEmit`, strict) → lint (ESLint incl. module-
   boundary rule) → format check.
2. unit tests + integration tests (in-memory Mongo + Redis via test containers).
3. build Docker image; run migrations dry-run; generate + validate OpenAPI.
4. security: dependency audit, secret scan, SAST.
5. Required green before merge; branch protection on `main`/`develop`.

**CD:**
- **staging:** on merge to `develop` → build & push image to registry (ECR) → deploy to
  staging EC2 (pull image, run migrations, PM2 graceful reload) → smoke tests.
- **production:** on tagged release / approved merge to `main` → same pipeline with a
  **manual approval gate**, DB migration step (reversible, doc 02 §2.9), health-checked
  rollout, and automatic rollback on failed health checks.
- **Zero-downtime:** PM2 cluster reload + NGINX draining; migrations are
  backward-compatible (expand/contract pattern) so old and new instances coexist
  during rollout.

## 17.6 Secrets & config in CI/CD

- Secrets injected from AWS Secrets Manager / GitHub encrypted secrets at deploy time;
  never in the repo. The app reads production secrets from Secrets Manager at boot
  (doc 08 §8.8).

## 17.7 Observability

- **Logs:** structured JSON (pino) with correlationId, shipped to a log aggregator
  (CloudWatch / Loki / ELK). Redaction rules strip PII/secrets.
- **Metrics:** `prom-client` exposes RED metrics (Rate, Errors, Duration) per route +
  queue depth, job latency, DB pool, cache hit rate → Prometheus/Grafana. Business
  metrics too (bookings/min, payment success rate, payout backlog).
- **Traces:** OpenTelemetry spans across API → worker → external calls, tied by
  correlationId → find slow paths end to end.
- **Alerting:** SLO-based alerts (error rate, p99 latency, queue backlog, failed
  payouts, reconciliation mismatch) → on-call. Health/readiness endpoints (doc 05
  §system) feed LB + uptime monitors.
- **Error tracking:** Sentry for exceptions with release + correlationId.

## 17.8 Backups & DR

- MongoDB: automated snapshots + point-in-time recovery (Atlas) with tested restores;
  ledger/audit collections are the crown jewels.
- S3: versioning + lifecycle (transition docs to cheaper tiers, archive audit to
  Glacier); cross-region replication for critical buckets.
- Defined **RPO/RTO**; DR runbook and periodic restore drills (a backup you've never
  restored is not a backup).

## 17.9 Scaling levers (in order you'd pull them)

1. Vertical + more API nodes behind NGINX (stateless → trivial).
2. More worker nodes / queue concurrency for async load.
3. MongoDB read replicas for read-heavy paths (search, listings) via read preference.
4. Redis scaling (cluster) for cache/queue growth.
5. Move media/search to dedicated infra (CDN already there; Elastic for search).
6. **Extract hot modules to services** (doc 18) when a single domain's load or team
   ownership justifies it.
7. MongoDB **sharding** (by region/tenant) for the marketplace/fleet scale future —
   UUID v7 keys + region geohash already make sharding feasible.

## 17.10 Cost & security guardrails

- Least-privilege IAM per role (API vs worker vs CI), no long-lived keys where a role
  works.
- Maps/SMS/SES usage capped + alerted (top abuse-cost vectors) with caching (doc 13).
- Autoscaling policies to match demand curves (weekend travel peaks) without
  over-provisioning.
