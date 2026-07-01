# 10 — Vehicle Module (Supply)

The vehicle is the platform's core asset. The single most important design choice:
**a vehicle is one entity with multiple *purposes/lifecycles*, not a different type
per business line.** The same `Vehicle` can be rented (P2P), sold (marketplace),
fleet-managed, or financed — driven by `purposes: [rent|sell|fleet|finance]` and
purpose-specific listing records. This is what lets the EV, marketplace, fleet, and
financing lines reuse supply without a data migration.

## 10.1 Sub-domains within the module

```
vehicles/
  ├─ listing        (the rentable/sellable presentation + booking settings)
  ├─ verification   (docs + trust checks → bookable)
  ├─ media          (images/videos — delegates to media module)
  ├─ documents      (RC, insurance, pollution, fitness — delegates to documents module)
  ├─ availability   (own module: availability_calendar)
  ├─ pricing        (own module: pricing_rules)
  ├─ maintenance    (service records, vehicle health)
  └─ delivery       (self / airport / custom-radius options)
```
Availability and Pricing are **their own modules** (they have distinct scaling and
query patterns and other modules depend on them directly), but they belong to the
supply context and are described here for the complete picture.

## 10.2 Vehicle listing lifecycle

```
draft ──submit──▶ pending_verification ──approve──▶ listed ⇄ paused ──delist──▶ delisted
                          │ reject
                          ▼
                       draft (with reasons)
```
- **draft:** host builds the listing (details, media, pricing) — not searchable.
- **pending_verification:** submitted; ops/automated checks run.
- **listed:** verified + complete → appears in search, bookable.
- **paused:** host temporarily hides (vacation) — keeps data, not searchable.
- **delisted:** soft-removed; historical bookings/reviews preserved.

Only `listed` + `verification.status=verified` vehicles are returned by search and
accepted by the booking engine (`isBookable()` contract).

## 10.3 Vehicle verification (trust gate)

A vehicle is bookable only when:
1. Required **documents** present & verified: registration (RC), valid insurance,
   pollution/fitness (region-dependent), each with `expiresAt` monitored.
2. Ownership consistent with the host's KYC identity (fraud check).
3. Minimum media quality (N photos, required angles) — partly automated (blur/
   duplicate detection), partly ops review.
4. No open trust flags.

Verification is a **workflow** with statuses and an ops queue (admin panel). Document
expiry is monitored by a cron that emits reminders and auto-pauses listings whose
insurance/RC expired (a legal must — you cannot rent an uninsured car).

## 10.4 Media (images/videos)

- Uploads never pass through the API: client requests **presigned S3 PUT URLs**
  (size/content-type constrained), uploads directly, then an S3 event enqueues a
  **media-processing job** that:
  - generates responsive variants (thumb/md/lg) + `blurhash` placeholder,
  - transcodes video to HLS + poster,
  - runs AV/malware + basic content-safety checks,
  - sets `processingStatus: ready` and attaches to the vehicle.
- Delivery via Cloudflare CDN over the (public-read-through-CDN, not public-ACL)
  image bucket → fast global loads, offloaded from origin.
- Ordering is host-controlled; the first ready image is the cover.

## 10.5 Availability calendar

Modeled as explicit day/range documents per vehicle (doc 04 §availability_calendar),
states `available | blocked | booked | held`.
- **Host blocks:** maintenance, personal use.
- **External sync (future):** iCal import/export to sync with Turo/other platforms so
  a vehicle isn't double-listed — a `calendar-sync` cron reconciles.
- **Holds:** short-TTL reservations during checkout (doc 09 §9.4) prevent double
  booking.
- **Why explicit docs, not computed-from-bookings:** reads (search, calendar UI) hugely
  outnumber writes; precomputed state makes availability an index lookup and the
  double-booking guard a unique constraint.

## 10.6 Pricing calendar & rules

`pricing_rules` supports layered pricing:
- **Base** daily/hourly price.
- **Weekday multipliers** (weekends premium).
- **Seasonal** ranges (holidays, peak).
- **Length-of-trip discounts** (weekly/monthly).
- **Dynamic pricing hook** (`dynamic.enabled`, floor/ceiling) — a placeholder for a
  future demand-based ML model. The Pricing contract's `quote()` is the single entry
  point; today it applies rules, tomorrow it can call a model, and **no caller
  changes** because they only ever see a quote DTO.

Pricing is always **recomputed server-side** at booking time; the client-displayed
price is advisory. The final `priceBreakdown` is snapshotted onto the booking
(immutable) so later rule changes never alter historical bookings.

## 10.7 Maintenance records & vehicle health

- `maintenance_records` (owned by vehicles): service history, odometer at service,
  cost, next-due. Feeds fleet utilization and a **vehicle-health score**.
- Trip return odometer + reported issues update health signals.
- Health/maintenance-due can auto-pause a listing (safety) and feed fleet dashboards.
- **EV extension:** `vehicle.ev` holds battery/range/connector data; with telemetry
  (`canTelemetry`) the EV line later ingests state-of-charge/range into trip and
  search ("min range" filter) — the schema already reserves the fields.

## 10.8 Delivery options

`listing.delivery` supports:
- **self pickup** (guest comes to vehicle location),
- **airport delivery** (matched to airport codes in search),
- **custom-radius delivery** with a fee and max radius (uses Maps distance).
Delivery choice becomes part of the booking's `pickup`/`dropoff` and price breakdown.

## 10.9 Contracts this module exposes

- `getVehicle(id)`, `getVehicleForBooking(id)` → returns the snapshot booking needs
  (host, price refs, location, deposit, cancellation policy).
- `isBookable(id, period)` → true only if listed, verified, docs valid, not blocked.
- `getVehiclesByIds(ids)` → batch resolve for search/booking hydration (avoids N+1).

These are the only ways bookings/search touch supply — never a direct model import.

## 10.10 Future-line readiness (why this module scales to the roadmap)

| Line | What's already here | What the module adds later |
|---|---|---|
| EV ecosystem | `ev` fields, connector types | telemetry ingestion, range-aware search, charging stations module |
| Marketplace (sell) | `purposes:[sell]`, media, docs | for-sale listing + offer/escrow (marketplace module) |
| Fleet | `fleetId`, bulk-friendly repo, health | fleet dashboards, bulk ops (fleet module) |
| Financing | `purposes:[finance]`, verified docs, KYC link | loan products, underwriting (financing module) |
| Creator marketplace | media pipeline, host profiles | creator content + affiliate attribution |

None of these require reshaping the `Vehicle` core — they attach purpose-specific
records and new modules that read supply via the contracts above.
