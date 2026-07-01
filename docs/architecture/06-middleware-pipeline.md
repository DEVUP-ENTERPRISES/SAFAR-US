# 06 — Middleware Pipeline

The pipeline is the **spine of every request**. Order matters enormously: cheap
rejections happen before expensive work, security before logic, and error handling
wraps everything. Middleware is **reusable and composable** — defined once in
`shared/middleware`, applied globally or per-route.

## 6.1 Global pipeline (in exact order)

```
Request
  │
  1. Trust proxy / raw-body capture (Stripe webhook needs raw body BEFORE json parse)
  2. requestContext        → generate correlationId, bind AsyncLocalStorage
  3. securityHeaders        → helmet (CSP, HSTS, noSniff, frameguard, etc.)
  4. cors                   → strict allowlist of origins per environment
  5. compression            → gzip/brotli responses (skip for already-compressed)
  6. bodyParser             → json + urlencoded with size limits (payload bomb guard)
  7. requestLogger          → structured access log w/ correlationId, latency (on finish)
  8. globalRateLimiter      → coarse per-IP limiter (DDoS backstop; Redis-backed)
  9. mongoSanitize + xssGuard → strip $/., neutralize injection in inputs
  │
  ├───────────  per-route middleware (below)  ───────────
  │
  10. route handlers (module routers mounted at /api/v1/*)
  11. notFound              → 404 for unmatched routes
  12. errorHandler          → LAST: converts any error → standard envelope
Response
```

### Per-route middleware (declared in each module's `*.routes.ts`)
```
authenticate            → verify JWT, load session from Redis, attach req.principal
   └ (public routes skip this; they use optionalAuthenticate)
authorize('perm:key')   → RBAC/policy check against principal (fail closed)
validate(schema)        → Zod validation of body/query/params → typed req.dto
idempotency             → on unsafe money routes; dedupe by Idempotency-Key
routeRateLimiter(opts)  → tighter limits on sensitive routes (login, otp, payments)
auditLog(action)        → record who-did-what for sensitive mutations
--> controller
```

## 6.2 Each middleware, in detail

### 1. Raw-body capture
Stripe (and other) webhooks must verify a signature over the **exact raw bytes**.
JSON parsing mutates the body and breaks signature verification. We capture the raw
buffer on webhook routes *before* `bodyParser` runs, and skip JSON parsing there.
**Why first:** once parsed, the raw bytes are gone.

### 2. requestContext (correlation id)
Generates a `correlationId` (or adopts inbound `X-Request-Id` from Cloudflare/NGINX),
stores it in **AsyncLocalStorage** so every log line, DB call, event, and job spawned
by this request carries the same id — end-to-end tracing across API → worker → socket.
**Why:** in production, "which of 10,000 requests caused this" is unanswerable without
it. This is non-negotiable observability.

### 3. securityHeaders (helmet)
Sets HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, a strict
Content-Security-Policy, `Referrer-Policy`, disables `X-Powered-By`. **Why early:**
these must be on every response including error responses.

### 4. cors
Environment-specific **allowlist** (mobile uses native HTTP, not CORS; the admin web
and marketing site are the CORS consumers). Credentials allowed only for trusted
origins. **Never** `origin: *` with credentials.

### 5. compression
Brotli/gzip for text responses above a threshold. Skips images/video (already
compressed) and skips when client doesn't accept. **Why after security, before
logic:** it wraps response output.

### 6. bodyParser
`express.json({ limit: '1mb' })` (uploads go to S3 via signed URLs, not through the
API, so the API never accepts large bodies). Guards against payload-bomb DoS.

### 7. requestLogger
Structured (pino) access log emitted **on response finish**: method, path,
status, latency, bytes, userId (if authed), correlationId. Sensitive fields
redacted. **Why on finish:** we want the outcome + latency, not just the arrival.

### 8. globalRateLimiter
Coarse per-IP token bucket in Redis (e.g. 100 req / 10s / IP) as a DDoS backstop
behind Cloudflare. Route-specific limiters (login: 5/min, otp: 3/10min) are tighter
and applied per-route. **Why global first:** reject floods before spending CPU on
auth/validation.

### 9. mongoSanitize + xssGuard
- **mongoSanitize:** strips keys containing `$` or `.` from inputs → prevents NoSQL
  operator injection (`{ "$gt": "" }` attacks). Combined with the fact that our
  repositories build queries from **typed DTOs**, not raw user objects, injection
  surface is near zero.
- **xssGuard:** sanitizes/encodes string inputs that will be rendered (reviews,
  messages, support). Output encoding also happens at render, but defense-in-depth.

### authenticate
1. Extract bearer token. 2. Verify signature + `exp` + `kid` (JWT rotation, doc 08).
3. Load the session from Redis by `sessionId` claim; reject if revoked/expired.
4. Attach `req.principal = { userId, roles, permissions, sessionId, scopes }`.
- `optionalAuthenticate` variant: populates principal if a valid token exists, else
  proceeds as guest (used for public search that personalizes when logged in).
- **Why load session even with a valid JWT:** JWTs can't be revoked mid-life. The
  session lookup lets us kill a stolen token immediately (logout-all, ban) — the
  balance between JWT statelessness and revocation control (doc 08 §"hybrid").

### authorize('resource:action[:scope]')
A **factory** that returns middleware bound to a required permission. It:
1. Checks the principal's effective permissions (role → permissions, cached).
2. For ownership-scoped actions ("cancel *own* booking"), delegates to the module's
   **policy** object (`booking.policy.ts`) which loads the resource and checks
   ownership/tenant scope. **Fail closed:** any doubt → 403.
- **Why a factory + policy split:** coarse permission ("can cancel bookings") is
  role-level and fast; fine ownership ("this booking is yours / your org's") needs
  the resource and lives in the module. Separating them keeps the middleware generic
  and the business rule in the domain.

### validate(schema)
Runs the route's Zod schema over `{ body, query, params }`. On failure → `422` with
field-level `details`. On success, attaches the **parsed, typed** value as `req.dto`
— controllers consume `req.dto`, never raw `req.body`. **Why:** validation is the
trust boundary. Nothing untyped/unvalidated reaches a service. This also strips
unknown fields (mass-assignment protection).

### idempotency
On money/side-effect POSTs, requires `Idempotency-Key`; implements the contract in
[05 §5.6]. **Why in the pipeline, not the service:** it's a cross-cutting concern that
must run before the controller so replays never re-enter business logic.

### routeRateLimiter
Per-route, per-identity limits (by userId when authed, else IP). Sensitive endpoints
(login, otp/request, password/reset, payments) get strict limits + progressive
backoff. Contributes to account-lockout & suspicious-login signals (doc 08).

### auditLog(action)
For sensitive mutations (status changes, refunds, verifications, admin actions),
records an `audit_logs` entry with actor, before/after, ip, correlationId. Runs
around the handler to capture the outcome. **Why middleware + also service-level for
domain events:** middleware captures the HTTP action uniformly; domain events capture
business meaning. Both feed compliance.

### responseFormatter
Not literally middleware but a response helper (`res.ok(data, meta)` /
`res.created(data)`) used by controllers to guarantee the standard envelope. A thin
middleware also normalizes any raw `res.json` into the envelope as a safety net.

### notFound
Any request that matches no route → standardized `404` envelope (not Express's HTML
default).

### errorHandler (last, 4-arg)
The **single** place errors become responses. It:
1. Recognizes `DomainError` subclasses → maps `code` + `httpStatus` + safe `message`.
2. Maps known infra errors (Mongo duplicate key → 409, validation → 422, JWT →
   401).
3. Unknown/unexpected → logs full stack with correlationId, returns generic `500`
   with the `requestId` (never leaks internals to the client).
4. Emits an error metric + (for 5xx) an alert signal.
- **Why centralized:** no `try/catch`-to-`res.status(500)` scattered across
  controllers (that's how you leak stack traces and get inconsistent errors). The
  `asyncHandler` wrapper ensures rejected promises route here too.

## 6.3 Why this order is correct (summary of the reasoning)

- **Reject cheap and early:** raw-body/ctx → security → cors → rate-limit before any
  auth or DB work. A flood dies at step 8, not after a DB round-trip.
- **Security before logic:** headers, sanitization, and auth gate the request before
  it can touch data.
- **Trust boundary is explicit:** after `validate`, everything downstream is typed and
  safe. Before it, everything is hostile.
- **Observability wraps everything:** correlationId is set first (step 2) and the
  error handler / logger are last, so both success and failure are fully traced.
- **One error exit:** every path — thrown domain error, rejected promise, unknown
  crash — converges on `errorHandler`, guaranteeing a consistent, safe, logged
  response.
