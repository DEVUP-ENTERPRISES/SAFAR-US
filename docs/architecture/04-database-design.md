# 04 — Database Design (MongoDB)

## 4.1 Philosophy: "normalized enough," reference across boundaries, embed within

MongoDB is document-oriented, so classic 3NF is not the goal — but "throw everything
in one document" is how you get 16MB-document disasters and unqueryable data. Our
rules:

1. **Reference across module/aggregate boundaries; embed within an aggregate.**
   A `Booking` references `userId`, `vehicleId`, `hostId` (they are separate
   aggregates owned by separate modules). But a booking's `priceBreakdown` and
   `statusHistory` are embedded — they have no life outside the booking.
2. **One collection is owned by exactly one module.** No module queries another
   module's collections. This is what makes "give each service its own database"
   later a config change. (Enforced by repository ownership + code review.)
3. **Every document carries standard audit + soft-delete columns** (§4.3).
4. **Primary keys are UUID v7**, stored as the `_id`. Time-sortable, globally unique,
   safe to expose, and merge-friendly across future sharded services (§4.2).
5. **Money is embedded as `{ amount: <integer minor units>, currency: <ISO4217> }`.**
   Never a float. Never a bare number.
6. **Design indexes for query patterns, not for entities.** Every collection section
   below lists its indexes and the query each serves.

---

## 4.2 Identifiers: why UUID v7 instead of ObjectId

- **ObjectId** leaks creation time + machine + counter and is Mongo-specific.
- **Auto-increment** does not exist safely in a distributed system.
- **UUID v4** is random → terrible index locality (random inserts fragment the
  B-tree, hurting write throughput and cache hit rate).
- **UUID v7** is time-ordered (timestamp prefix + randomness). It gives near-sequential
  index inserts (great locality) while remaining globally unique and non-guessable in
  the random portion. When modules split into services with their own DBs, IDs remain
  globally unique with **zero coordination**. This is the correct choice for a system
  that will shard and split.

IDs are **branded types** in TypeScript (`UserId`, `VehicleId`) so you cannot pass a
`VehicleId` where a `UserId` is expected — a whole class of bugs eliminated at
compile time.

---

## 4.3 Standard fields on every collection

```
_id            : UUID v7 (string)            // primary key
createdAt      : Date                        // set on insert
updatedAt      : Date                        // bumped on every write
createdBy      : UserId | 'system'           // actor who created (audit)
updatedBy      : UserId | 'system'           // actor of last write (audit)
version        : int                          // optimistic concurrency (see §4.4)
deletedAt      : Date | null                 // soft delete tombstone (null = live)
deletedBy      : UserId | null
```

- **Soft delete** is default: destructive `DELETE` sets `deletedAt`. All default
  queries filter `deletedAt: null` (a repository base method enforces this so no one
  forgets). Hard deletes happen only via audited retention jobs (GDPR/erasure).
- **Why soft delete everywhere:** disputes, chargebacks, claims, and audits routinely
  need records that a user "deleted." Compliance and trust & safety demand it.

---

## 4.4 Concurrency & consistency

- **Optimistic locking** via the `version` field. Update queries include the read
  `version`; a mismatch means someone else wrote first → we throw `ConflictError` and
  the caller retries. Used for bookings, wallet, availability — anywhere lost updates
  cause money/double-booking bugs.
- **Multi-document transactions** (Mongo replica set required — we run one from day
  one) for operations that must be atomic across collections: e.g. create booking +
  write outbox event + place availability hold. Wrapped by
  `TransactionManager.withTransaction()`.
- **Distributed locks** (Redis Redlock) for cross-request critical sections that
  can't be a single DB transaction (e.g. "only one payout run at a time").

---

## 4.5 Collections

Below, `→` denotes a reference (foreign key by UUID). `⊂` denotes an embedded
subdocument/array. Indexes list the query they serve.

### users
```
_id, phone (E.164, unique sparse), email (unique sparse), emailVerified, phoneVerified,
firstName, lastName, avatarMediaId → media, locale, timezone, country,
roles: [RoleName],                       // denormalized for fast authz (source: user_roles)
status: enum(active|suspended|banned|deleted),
preferences ⊂ { notifications:{push,email,sms}, currency, ... },
devices ⊂ [{ deviceId, platform, fcmToken, lastSeenAt, appVersion }],  // multi-device
lastLoginAt, + standard fields
```
Indexes: `{email:1} unique sparse`, `{phone:1} unique sparse`, `{status:1}`,
`{roles:1}`, `{"devices.fcmToken":1}` (push targeting), `{deletedAt:1}`.

### auth_credentials  *(separated from users so PII vs secrets have different access)*
```
_id, userId → users (unique), passwordHash (argon2id, nullable if OAuth-only),
providers ⊂ [{ provider: google|apple, providerUserId, linkedAt }],
mfa ⊂ { enabled, methods:[totp|sms], secretRef (KMS) },
failedLoginCount, lockedUntil,            // account lockout
lastPasswordChangeAt, + standard fields
```
Indexes: `{userId:1} unique`, `{"providers.provider":1,"providers.providerUserId":1} unique sparse`.

### sessions  *(also mirrored in Redis for fast validation; Mongo is the durable record)*
```
_id, userId → users, deviceId, refreshTokenHash (sha256 of rotating token),
refreshTokenFamilyId,                     // for rotation/replay detection (§08)
userAgent, ip, ipGeo ⊂ {country,city}, isCurrent,
expiresAt (TTL index), revokedAt, revokedReason, + standard fields
```
Indexes: `{userId:1, revokedAt:1}`, `{refreshTokenHash:1} unique`,
`{expiresAt:1} TTL`, `{refreshTokenFamilyId:1}`.

### otp_requests  *(short-lived; primarily Redis, Mongo optional for audit/throttle)*
```
_id, channel: phone|email, target, purpose: login|verify|reset,
codeHash, attempts, maxAttempts, expiresAt (TTL), consumedAt, ip, + standard
```
Indexes: `{target:1, purpose:1}`, `{expiresAt:1} TTL`.

### roles  &  permissions  &  role_permissions  &  user_roles
See [07-rbac.md](./07-rbac.md) for the full RBAC schema; summarized:
```
roles:            _id, name(unique), description, isSystem, + standard
permissions:      _id, key(unique, e.g. "booking:cancel:any"), resource, action, scope, description
role_permissions: _id, roleId → roles, permissionId → permissions   (join)
user_roles:       _id, userId → users, roleId → roles, scope ⊂ {orgId?, fleetId?}, grantedBy, expiresAt
```
`user_roles.scope` is what enables **scoped roles** (Fleet Manager *of fleet X*,
Corporate Admin *of org Y*) — critical for the multi-tenant future.

### hosts
```
_id, userId → users (unique), displayName, bio, businessType: individual|business,
verificationStatus: enum, payoutAccount ⊂ { stripeConnectedAccountId, status, currency },
ratingAvg, ratingCount,                   // denormalized aggregate (source: reviews)
totalTrips, responseRateBps, responseTimeMins,   // host quality signals
+ standard fields
```
Indexes: `{userId:1} unique`, `{verificationStatus:1}`, `{ratingAvg:-1}`.

### vehicles
```
_id, hostId → hosts, ownerType: individual|fleet, fleetId → fleets (nullable),
make, model, year, trim, bodyType, transmission, fuelType: petrol|diesel|hybrid|ev,
seats, doors, color, registrationNumber (encrypted), vin (encrypted, unique sparse),
features: [enum],                          // aircon, gps, bluetooth, childseat...
ev ⊂ { batteryKwh, rangeKm, connectorTypes:[], canTelemetry:bool } (nullable),
location ⊂ { type:"Point", coordinates:[lng,lat], address, city, country, geohash },
purposes: [rent|sell|fleet|finance],       // ⭐ multi-lifecycle capability flags
listing ⊂ { title, description, instantBook:bool, minTripHrs, maxTripHrs,
            advanceNoticeHrs, delivery:{airport:bool, custom:bool, radiusKm, fee} },
verification ⊂ { status:enum, verifiedAt, documentsComplete:bool },
media: [mediaId → media] (ordered),        // references, not embedded blobs
status: enum(draft|pending|listed|paused|delisted),
ratingAvg, ratingCount, totalTrips,        // denormalized
+ standard fields
```
Indexes:
- `{location: "2dsphere"}` — geo/nearby search
- `{status:1, "verification.status":1}` — only surface bookable vehicles
- `{hostId:1, status:1}` — host's listings
- `{fleetId:1}` — fleet rollups
- `{make:1, model:1, year:1}` — faceted filters
- `{purposes:1}` — marketplace/finance surfaces
- compound for search: `{status:1, city:1, bodyType:1, "listing.instantBook":1}`

**Why `location` embeds a geohash too:** 2dsphere handles radius queries; a stored
geohash prefix enables cheap coarse bucketing/caching and future sharding by region.

### vehicle_documents  *(owned by documents module, referenced by vehicles)*
```
_id, vehicleId → vehicles, type: rc|insurance|pollution|fitness,
documentId → documents, expiresAt, status: pending|verified|rejected|expired, + standard
```
Indexes: `{vehicleId:1, type:1}`, `{expiresAt:1}` (expiry reminder cron).

### availability_calendar  *(one doc per vehicle per day-range block — see note)*
```
_id, vehicleId → vehicles, date (UTC day) OR range ⊂ {start,end},
state: available|blocked|booked|held,
blockReason: maintenance|host_block|external_sync, bookingId → bookings (if booked),
holdId, holdExpiresAt,                     // soft holds during checkout
+ standard fields
```
Indexes: `{vehicleId:1, date:1} unique` (or `{vehicleId:1,"range.start":1,"range.end":1}`),
`{holdExpiresAt:1} TTL-ish` (a cron releases expired holds).

**Design note:** availability is modeled as **explicit day/range documents** rather
than trying to compute gaps from bookings on the fly. Reason: reads (calendar,
search) vastly outnumber writes, and precomputed availability makes both search and
double-booking prevention O(index lookup). A hold-then-confirm flow prevents two
guests booking the same slot (see [09](./09-booking-engine.md)).

### pricing_rules
```
_id, vehicleId → vehicles (nullable for host/global defaults), scope: vehicle|host|global,
baseDailyPrice ⊂ Money, hourlyPrice ⊂ Money,
seasonal ⊂ [{ start, end, multiplierBps }],
weekday ⊂ { mon..sun: multiplierBps },
minDaysDiscounts ⊂ [{ minDays, discountBps }],   // weekly/monthly discounts
dynamic ⊂ { enabled, floorBps, ceilBps, model: "demand_v1" },  // future ML hook
+ standard fields
```
Indexes: `{vehicleId:1, scope:1}`.

### bookings
```
_id, code (human-friendly, unique, e.g. TURA-8K3F2),
guestId → users, hostId → hosts, vehicleId → vehicles,
period ⊂ { start, end, timezone },
pickup ⊂ { type: self|delivery|airport, location:{...}, instructions },
dropoff ⊂ {...},
priceBreakdown ⊂ {                         // immutable snapshot at booking time
   base:Money, extras:[{code,amount}], deliveryFee:Money, discount:Money,
   couponCode, insuranceFee:Money, taxes:[{code,amount}], serviceFee:Money,
   total:Money, hostEarnings:Money, platformCommission:Money, currency },
status: enum (see 09),
statusHistory ⊂ [{ from, to, at, by, reason }],   // full audit trail embedded
paymentIntentId → payments,
couponId → coupons (nullable), insuranceCoverageId → insurance (nullable),
instantBook: bool, approvalDeadline, cancellation ⊂ { by, at, reason, refund:Money },
tripId → trips (nullable until started),
version,                                    // optimistic lock
idempotencyKey,                            // dedupe create
+ standard fields
```
Indexes:
- `{code:1} unique`
- `{guestId:1, createdAt:-1}` — "my trips" list (cursor paginated)
- `{hostId:1, status:1, createdAt:-1}` — host dashboard
- `{vehicleId:1, "period.start":1, "period.end":1}` — overlap checks
- `{status:1, approvalDeadline:1}` — expire pending (cron)
- `{idempotencyKey:1} unique sparse`

### trips
```
_id, bookingId → bookings (unique), vehicleId, guestId, hostId,
status: enum(scheduled|handover_pending|active|return_pending|completed|disputed),
handover ⊂ { at, odometerStart, fuelStart, photos:[mediaId], guestSignature, hostSignature, geo },
return   ⊂ { at, odometerEnd, fuelEnd, photos:[mediaId], geo },
liveLocation ⊂ { type:"Point", coordinates:[lng,lat], updatedAt },  // last known
distanceKm, overageCharges ⊂ [{type, amount}],
+ standard fields
```
Indexes: `{bookingId:1} unique`, `{status:1}`, `{liveLocation:"2dsphere"}`,
`{guestId:1,status:1}`, `{hostId:1,status:1}`.

### payments  (Stripe-facing records)
```
_id, bookingId → bookings (nullable for wallet topups/subscriptions),
userId → users, type: booking|topup|subscription|deposit,
stripePaymentIntentId (unique), stripeChargeId, method: card|apple_pay|google_pay,
amount ⊂ Money, capturedAmount ⊂ Money, refundedAmount ⊂ Money,
status: enum(requires_action|processing|succeeded|failed|refunded|partially_refunded),
depositHold ⊂ { amount:Money, releasedAt } (nullable),  // security deposit auth-hold
idempotencyKey, failureCode, + standard fields
```
Indexes: `{stripePaymentIntentId:1} unique`, `{bookingId:1}`, `{userId:1,createdAt:-1}`,
`{status:1}`, `{idempotencyKey:1} unique sparse`.

### ledger_entries  ⭐ (append-only, double-entry — the financial source of truth)
```
_id, txnId (groups the balanced set of entries in one financial transaction),
account: enum(user_wallet:<id> | host_payable:<id> | platform_revenue |
              platform_tax | stripe_clearing | promo_expense | ...),
direction: debit|credit, amount ⊂ Money,
refType: booking|payout|refund|topup|adjustment, refId,
description, postedAt,
+ createdAt (NO updatedAt/deletedAt — entries are IMMUTABLE, never edited/deleted)
```
Indexes: `{txnId:1}`, `{account:1, postedAt:-1}`, `{refType:1, refId:1}`.
**Invariant:** for any `txnId`, `sum(credits) === sum(debits)`. Enforced in code and
verified by a nightly reconciliation job. Balances are *derived* (sum over account),
optionally snapshotted for speed. This is how Stripe/Uber model money — never a
mutable `balance` field that can drift. See [11](./11-payment-engine.md).

### wallets  (a projection/cache over ledger for fast reads)
```
_id, userId → users (unique), currency, balanceCached ⊂ Money, lastLedgerAt, + standard
```
Indexes: `{userId:1} unique`. Rebuildable from `ledger_entries` at any time.

### payouts
```
_id, hostId → hosts, periodStart, periodEnd, bookingIds:[ref],
amount ⊂ Money, status: enum(scheduled|processing|paid|failed),
stripeTransferId, ledgerTxnId, failureReason, scheduledFor, paidAt, + standard
```
Indexes: `{hostId:1, status:1}`, `{status:1, scheduledFor:1}` (payout run cron).

### coupons  &  coupon_redemptions
```
coupons: _id, code(unique), type: percent|fixed, valueBps|amount, currency,
   maxRedemptions, perUserLimit, minSpend:Money, validFrom, validTo,
   appliesTo ⊂ {firstBookingOnly, vehicleTypes, regions}, status, + standard
coupon_redemptions: _id, couponId→, userId→, bookingId→, amount:Money, redeemedAt + standard
```
Indexes: `coupons {code:1} unique`, `{status:1, validTo:1}`;
`coupon_redemptions {couponId:1,userId:1}` (enforce per-user limit).

### reviews
```
_id, bookingId → bookings, tripId → trips, direction: guest_to_host|host_to_guest,
authorId → users, subjectId → users, vehicleId → vehicles (if about vehicle),
rating (1-5), comment, categories ⊂ {cleanliness,communication,accuracy,...},
response ⊂ { text, at } (subject's reply), status: published|hidden|flagged,
+ standard
```
Indexes: `{subjectId:1, status:1}`, `{vehicleId:1, status:1}`, `{bookingId:1, direction:1} unique`.

### documents  (generic secure doc store; KYC/insurance/claims reference it)
```
_id, ownerId → users, category: kyc|license|insurance|vehicle|claim|invoice,
s3Key, bucket, mimeType, sizeBytes, checksum, encryptionKeyId (KMS),
verification ⊂ { status, verifiedBy, verifiedAt, rejectionReason },
expiresAt, scanStatus: pending|clean|infected,   // AV scan gate
+ standard
```
Indexes: `{ownerId:1, category:1}`, `{"verification.status":1}`, `{expiresAt:1}`.

### media  (images/videos)
```
_id, ownerId, ownerType: vehicle|user|trip|claim, refId,
original ⊂ {s3Key, sizeBytes, mime}, variants ⊂ [{label:thumb|md|lg, s3Key, w, h}],
video ⊂ {duration, hlsManifestKey, poster} (nullable),
processingStatus: uploaded|processing|ready|failed, blurhash, + standard
```
Indexes: `{ownerType:1, refId:1}`, `{processingStatus:1}`.

### kyc_records
```
_id, userId → users (unique), level: basic|full, status: enum,
documents:[documentId → documents], provider, providerRef,
checks ⊂ {liveness, faceMatch, docAuthenticity}, reviewedBy, decisionAt, + standard
```
Indexes: `{userId:1} unique`, `{status:1}`.

### insurance_coverages
```
_id, bookingId → bookings (unique), productId, provider, policyNumber,
coverage ⊂ {type, deductible:Money, limits}, premium:Money,
boundAt, status: bound|active|expired|voided, + standard
```
Indexes: `{bookingId:1} unique`, `{status:1}`.

### claims
```
_id, bookingId → bookings, tripId → trips, claimantId → users, type: damage|theft|accident|other,
description, incidentAt, documents:[documentId], photos:[mediaId],
amountClaimed:Money, amountApproved:Money,
status: enum(opened|investigating|approved|rejected|settled|closed),
assignedTo → users (agent), timeline ⊂ [{status, at, by, note}], + standard
```
Indexes: `{bookingId:1}`, `{status:1, assignedTo:1}`, `{claimantId:1}`.

### notifications  (delivery log; templates & prefs separate)
```
_id, userId → users, channel: push|sms|email|inapp, templateKey, data ⊂ {...},
status: queued|sent|delivered|failed|read, providerRef, attempts, error,
sentAt, readAt, + standard
```
Indexes: `{userId:1, createdAt:-1}`, `{status:1}`, `{channel:1, status:1}`.

### notification_templates
```
_id, key(unique), channel, locale, subject, body (handlebars), variables:[names],
version, active:bool, + standard
```
Indexes: `{key:1, locale:1, channel:1} unique`.

### fleets  (future, scaffolded)
```
_id, orgId → corporate_orgs (nullable), name, managerUserId → users,
vehicleCount, region, settings ⊂ {...}, + standard
```
Indexes: `{orgId:1}`, `{managerUserId:1}`.

### corporate_orgs / cost_centers / travel_policies  (future, scaffolded)
```
corporate_orgs: _id, name, billingEmail, subscriptionId→, status, + standard
cost_centers:   _id, orgId→, name, budget:Money, approverUserIds:[ref], + standard
travel_policies:_id, orgId→, rules ⊂ {maxDailyPrice, allowedVehicleTypes, approvalRequiredOver}, + standard
```

### support_tickets
```
_id, userId → users, category, subject, status: open|pending|resolved|closed,
priority, assignedTo → users, messages ⊂ [{authorId, body, at, attachments}],
relatedType: booking|claim|payment, relatedId, slaDueAt, + standard
```
Indexes: `{status:1, priority:1, slaDueAt:1}`, `{assignedTo:1,status:1}`, `{userId:1}`.

### audit_logs  (append-only)
```
_id, actorId → users | 'system', actorRole, action (e.g. "booking.cancel"),
resourceType, resourceId, before ⊂ {...}, after ⊂ {...},
ip, userAgent, correlationId, at,
+ createdAt only (immutable)
```
Indexes: `{resourceType:1, resourceId:1, at:-1}`, `{actorId:1, at:-1}`, `{action:1, at:-1}`.
Consider a **TTL / archival to S3 (Glacier)** policy for entries older than N months.

### feature_flags  &  settings
```
feature_flags: _id, key(unique), description, enabled, rollout ⊂ {percentage, allowUserIds,
   allowRoles, regions}, variants, updatedBy, + standard
settings: _id, scope: system|user|org, scopeId, key, value(mixed), + standard
```
Indexes: `feature_flags {key:1} unique`; `settings {scope:1, scopeId:1, key:1} unique`.

### outbox  (transactional outbox — see 02 §2.5)
```
_id, eventName, aggregateType, aggregateId, payload ⊂ {...}, occurredAt,
status: pending|published|failed, attempts, publishedAt, correlationId, + createdAt
```
Indexes: `{status:1, occurredAt:1}` (relay scan), `{aggregateId:1}`.

### idempotency_keys
```
_id (the key), userId, endpoint, requestHash, responseSnapshot ⊂ {...},
status: in_progress|completed, expiresAt (TTL), + createdAt
```
Indexes: `{_id:1}` (pk), `{expiresAt:1} TTL`.

---

## 4.6 Relationship map (textual ERD)

```
users 1──1 auth_credentials
users 1──* sessions
users 1──1 hosts (if host)
users 1──1 kyc_records
users 1──* user_roles *──1 roles *──* permissions
hosts 1──* vehicles *──1 fleets(opt) *──1 corporate_orgs(opt)
vehicles 1──* vehicle_documents *──1 documents
vehicles 1──* availability_calendar
vehicles 1──1 pricing_rules(vehicle-scoped) (+ host/global defaults)
vehicles 1──* media
bookings *──1 users(guest), *──1 hosts, *──1 vehicles
bookings 1──1 trips
bookings 1──1 payments(intent), 1──1 insurance_coverages(opt)
bookings *──1 coupons (via coupon_redemptions)
bookings 1──* reviews (two directions)
bookings/payouts/refunds ──* ledger_entries (by refId)
users 1──1 wallets  (projection of ledger)
hosts 1──* payouts
trips 1──* claims *──* documents/media
* ──> audit_logs (by resourceType/resourceId)
* ──> outbox (by aggregateId)
```

---

## 4.7 Data ownership & the split-later guarantee

| DB "bounded context" (future service DB) | Collections |
|---|---|
| identity | users, auth_credentials, sessions, otp_requests, kyc_records, roles/permissions/joins |
| supply | vehicles, vehicle_documents, availability_calendar, pricing_rules, media |
| demand | bookings, trips, reviews, search projections |
| money | payments, ledger_entries, wallets, payouts, coupons, subscriptions |
| trust | insurance_coverages, claims, documents |
| platform | notifications(+templates), audit_logs, feature_flags, settings, support_tickets, outbox, analytics |

Because no cross-context collection joins exist (we reference by ID and resolve via
contracts/events), each context can be lifted to its own MongoDB cluster later
without a query rewrite. That is the payoff of the ownership discipline.
