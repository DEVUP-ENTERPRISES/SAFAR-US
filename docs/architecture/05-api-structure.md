# 05 — REST API Structure

## 5.1 Principles

- **Versioned from day one:** every route lives under `/api/v1/...`. Version lives in
  the URL (not header) because it is the most cache-friendly, proxy-friendly, and
  debuggable option — Cloudflare/NGINX can route by path.
- **Resource-oriented, noun-based URLs.** Verbs live in HTTP methods, not paths.
- **Consistent response envelope** for every response (success and error).
- **Stateless.** Auth is a bearer token; no server session affinity for HTTP.
- **Idempotency** required on unsafe methods that create money/side effects.
- **Cursor pagination** for large/append-heavy lists; offset only for small admin
  tables.
- **Predictable errors** with stable machine-readable codes.

## 5.2 Versioning strategy

- `v1` is the contract. Breaking changes → `v2` mounted alongside; `v1` kept until
  clients migrate (mobile apps live in the wild for months).
- Non-breaking additions (new optional fields, new endpoints) ship within `v1`.
- Deprecations announced via `Deprecation` and `Sunset` response headers + changelog.
- **The `presenter` layer per module** (doc 03) means `v1` and `v2` can render the
  same domain entity differently without duplicating business logic — only the view
  model changes.

## 5.3 Standard response envelope

Success:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "uuid", "pagination": { "nextCursor": "...", "hasMore": true } }
}
```
Error:
```json
{
  "success": false,
  "error": {
    "code": "BOOKING_DOUBLE_BOOKED",
    "message": "This vehicle is no longer available for the selected dates.",
    "details": [ { "field": "period.start", "issue": "overlaps existing booking" } ],
    "requestId": "uuid"
  }
}
```
- `message` is **safe for end users** (localizable). Internal detail is logged, never
  leaked. `code` is stable and documented so clients branch on it, not on message
  text.
- `requestId` (the correlation id) is echoed everywhere so support can trace any user
  report to exact logs.

## 5.4 HTTP conventions

| Method | Use | Idempotent | Body |
|---|---|---|---|
| GET | read | yes | no |
| POST | create / actions | no (use Idempotency-Key) | yes |
| PATCH | partial update | should be | yes |
| PUT | full replace | yes | yes |
| DELETE | soft-delete | yes | no |

Status codes: `200` ok, `201` created, `202` accepted (async job started),
`204` no content, `400` validation, `401` unauthenticated, `403` unauthorized,
`404` not found, `409` conflict (double booking / version clash), `422` semantic
validation, `429` rate limited, `5xx` server. We never return `200` with an error
body.

**Actions that aren't CRUD** use a sub-resource + POST, not a verb-in-path:
- `POST /api/v1/bookings/{id}/cancel`
- `POST /api/v1/bookings/{id}/confirm`
- `POST /api/v1/trips/{id}/start`
- `POST /api/v1/payouts/{id}/retry`

This keeps them resource-scoped, authorizable, and auditable.

## 5.5 Pagination, filtering, sorting

- **Cursor:** `GET /api/v1/vehicles?limit=20&cursor=<opaque>`. Cursor encodes
  `{sortValue, id}` (base64). Stable under inserts; no deep-offset performance cliff.
- **Filtering:** explicit query params validated by DTO: `?city=BLR&bodyType=suv&
  instantBook=true&priceMin=1000&priceMax=5000`.
- **Sorting:** `?sort=-ratingAvg,priceDaily` (whitelist of sortable fields only — no
  arbitrary field injection).
- **Field selection (sparse):** `?fields=id,title,priceDaily` to trim payloads for
  mobile.

## 5.6 Idempotency contract

- Client generates a UUID `Idempotency-Key` per logical operation (booking create,
  payment, payout retry) and retries with the **same** key on network failure.
- Server: on first receipt, mark `in_progress` in `idempotency_keys` (Redis + Mongo),
  process, store `responseSnapshot`, mark `completed`. On replay: if `completed`,
  return the stored response; if `in_progress`, return `409`/`425` (retry later). Keys
  expire after 24–48h.

## 5.7 Resource map (v1)

Grouped by module. `{id}` is a UUID. Auth/role requirements summarized; enforced by
`authorize()` middleware + policies (doc 07).

### Auth `/api/v1/auth`
```
POST   /register                      start registration (email/phone)
POST   /login                         password login → tokens
POST   /oauth/google                  Google id_token → tokens
POST   /oauth/apple                   Apple id_token → tokens
POST   /otp/request                   send phone/email OTP (rate limited hard)
POST   /otp/verify                    verify OTP → tokens or verified flag
POST   /token/refresh                 rotate refresh token → new access+refresh
POST   /logout                        revoke current session
POST   /logout/all                    revoke all sessions (all devices)
GET    /sessions                      list active sessions/devices
DELETE /sessions/{id}                 revoke a specific device session
POST   /password/forgot               request reset
POST   /password/reset                reset with token
```

### Users `/api/v1/users`
```
GET    /me                            current profile
PATCH  /me                            update profile
PATCH  /me/preferences                notification/currency prefs
POST   /me/devices                    register device + FCM token
DELETE /me/devices/{deviceId}
GET    /me/roles                      effective roles/permissions
GET    /{id}                          public profile (limited fields)
```

### Hosts `/api/v1/hosts`
```
POST   /onboard                       become a host
GET    /me                            host profile + stats
PATCH  /me                            update host profile
POST   /me/payout-account             link Stripe Connect account
GET    /me/dashboard                  earnings, upcoming trips, occupancy
```

### KYC `/api/v1/kyc`
```
POST   /submit                        submit identity docs (returns upload targets)
GET    /status                        current KYC status
```

### Vehicles `/api/v1/vehicles`
```
POST   /                              create listing (draft)
GET    /{id}                          public listing detail
PATCH  /{id}                          update listing
DELETE /{id}                          delist (soft)
POST   /{id}/submit                   submit for verification
POST   /{id}/media                    request signed upload URLs
PATCH  /{id}/media/order              reorder media
GET    /{id}/availability             availability calendar
PUT    /{id}/availability             set blocks (host)
GET    /{id}/pricing                  pricing calendar
PUT    /{id}/pricing                  set pricing rules
GET    /me/vehicles                   host's own listings
POST   /{id}/documents                attach vehicle doc
```

### Search `/api/v1/search`
```
GET    /vehicles                      geo+filter search (cursor paginated)
GET    /vehicles/nearby               ?lat&lng&radiusKm
GET    /vehicles/airport/{code}       airport pickup search
GET    /suggestions                   places autocomplete passthrough (cached)
```

### Bookings `/api/v1/bookings`
```
POST   /quote                         price a hypothetical booking (no commitment)
POST   /                              create booking (Idempotency-Key required)
GET    /{id}                          booking detail
GET    /                              my bookings (?role=guest|host, cursor)
POST   /{id}/confirm                  host approves (request-to-book flow)
POST   /{id}/decline                  host declines
POST   /{id}/cancel                   cancel (guest or host) → refund flow
POST   /{id}/extend                   request extension
GET    /{id}/timeline                 status history
```

### Trips `/api/v1/trips`
```
GET    /{id}                          trip detail
POST   /{id}/handover                 record handover (odometer, photos, signatures)
POST   /{id}/start                    start trip
POST   /{id}/location                 push live location (also via socket)
POST   /{id}/return                   record return
POST   /{id}/complete                 finalize (triggers payout scheduling)
```

### Payments `/api/v1/payments`
```
POST   /intents                       create payment intent for a booking
POST   /methods                       save a payment method (SetupIntent)
GET    /methods                       list saved methods
POST   /wallet/topup                  add funds
POST   /webhooks/stripe               Stripe webhook (raw body, signature verified)  [public+signed]
```

### Wallet / Payouts / Subscriptions
```
GET    /api/v1/wallet                 balance + ledger view
GET    /api/v1/wallet/transactions    ledger entries (cursor)
GET    /api/v1/payouts                 host payouts list
GET    /api/v1/payouts/{id}
POST   /api/v1/subscriptions          subscribe to a plan
GET    /api/v1/subscriptions/me
POST   /api/v1/subscriptions/{id}/cancel
```

### Coupons / Referral
```
POST   /api/v1/coupons/validate       check a code against a quote
GET    /api/v1/referral/me            my referral code + stats
POST   /api/v1/referral/redeem        apply referral at signup
```

### Reviews
```
POST   /api/v1/reviews                post review (only after completed trip)
GET    /api/v1/reviews?subjectId=     reviews about a user/vehicle
POST   /api/v1/reviews/{id}/response  subject replies
```

### Claims / Insurance / Support
```
POST   /api/v1/claims                 open a claim
GET    /api/v1/claims/{id}
POST   /api/v1/claims/{id}/documents
GET    /api/v1/insurance/products
POST   /api/v1/support/tickets
GET    /api/v1/support/tickets/{id}
POST   /api/v1/support/tickets/{id}/messages
```

### Notifications / Maps / Media / Documents
```
GET    /api/v1/notifications          in-app feed (cursor)
POST   /api/v1/notifications/read     mark read
GET    /api/v1/maps/geocode
GET    /api/v1/maps/reverse-geocode
GET    /api/v1/maps/distance-matrix
GET    /api/v1/maps/directions
POST   /api/v1/media/upload-urls      signed S3 upload URLs
POST   /api/v1/documents/upload-urls
```

### Admin `/api/v1/admin/*`  (all behind admin roles + audit)
```
GET    /admin/dashboard/metrics
GET    /admin/users            PATCH /admin/users/{id}/status
GET    /admin/hosts            POST  /admin/hosts/{id}/verify
GET    /admin/vehicles         POST  /admin/vehicles/{id}/verify
GET    /admin/bookings
GET    /admin/payments         POST  /admin/payments/{id}/refund
GET    /admin/payouts          POST  /admin/payouts/run
GET    /admin/claims           PATCH /admin/claims/{id}
GET    /admin/support/tickets
GET    /admin/feature-flags    PATCH /admin/feature-flags/{key}
GET    /admin/audit-logs
GET    /admin/settings         PATCH /admin/settings/{key}
```

### System `/api/v1/system`
```
GET    /health                        liveness (process up)
GET    /ready                         readiness (mongo+redis reachable)
GET    /version                       build/commit info
```

## 5.8 OpenAPI as source of truth

Every route's DTO/validator generates an OpenAPI 3.1 spec (`openapi.yaml`) in CI.
Benefits: the Flutter team generates a typed API client from it (no drift), contract
tests run against it, and it is the human-readable API reference. The spec is
**generated from the same Zod schemas** used at runtime for validation — one source,
no divergence between docs and reality.
