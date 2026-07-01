# 13 — Search Engine

Search is how demand meets supply — it directly drives conversion. It must be fast,
geo-aware, filterable, and rankable, and it must not become a bottleneck. The design
starts pragmatic (MongoDB geo + indexes) behind an adapter, so we can graduate to a
dedicated search engine (Atlas Search / Elasticsearch / OpenSearch) without changing
callers.

## 13.1 Adapter-first design

The `search` module depends on a `GeoSearchAdapter` interface. Today the
implementation is **MongoDB `2dsphere` + compound indexes**. When query volume/feature
demands (typo tolerance, relevance tuning, full-text, faceted aggregations at scale)
outgrow Mongo, we implement the same interface against Elasticsearch fed by a
CDC/event pipeline — **no controller or service change**. This is the "start simple,
scale deliberately" principle applied to search.

## 13.2 Query types

- **Nearby / radius search:** `?lat&lng&radiusKm` → `$geoNear`/`2dsphere` sorted by
  distance, filtered to bookable vehicles.
- **Bounding-box (map view):** vehicles within the visible map rectangle (efficient
  for map pans).
- **Airport search:** airport code → its coordinates → radius search + delivery
  filter (vehicles offering airport delivery).
- **City / area search:** geocoded area → radius/polygon.
- **Text + filters:** make/model/features combined with geo.

All results are constrained to `status=listed AND verification=verified AND available
for requested dates` — search never surfaces unbookable inventory.

## 13.3 Filters

Validated whitelist (no arbitrary field injection):
- price range, vehicle type (SUV/sedan/EV…), transmission, fuel/EV, seats, make/model/
  year, features (GPS, child seat, bluetooth), instant-book only, delivery available,
  min rating, min EV range, host superhost tier.
Filters map to indexed fields; the compound search index (doc 04 §vehicles) covers the
common combinations.

## 13.4 Availability-aware search (the hard part)

A vehicle listed but booked for the requested dates must not appear. Two-stage:
1. **Geo + attribute filter** narrows candidates (indexed, fast).
2. **Availability check** against `availability_calendar` for the requested period
   removes booked/blocked vehicles. To keep this fast at scale we maintain a
   **Redis-cached availability bitmap/summary per vehicle** (updated on booking/hold
   events) so the second stage is an in-memory intersection rather than N calendar
   queries. Cache is invalidated by `AvailabilityBlocked`/`BookingConfirmed` events.

## 13.5 Ranking

Ranking is a **scoring function**, isolated so it can evolve into ML:
```
score = w1·proximity + w2·priceCompetitiveness + w3·hostQuality(rating,responseRate)
      + w4·instantBook + w5·conversionHistory + w6·freshness + personalization(user)
```
- Weights live in config/feature-flags → tunable without deploy, A/B-testable.
- **Personalization** (when authed): past bookings, viewed types, price band.
- The scoring interface is a seam for a future **learning-to-rank model** trained on
  the event stream (impressions → clicks → bookings). The AI-readiness (every
  impression/click emitted as an event) is what makes this possible later.

## 13.6 Sorting & pagination

- Default sort: relevance score; user overrides: price ↑/↓, distance, rating,
  newest.
- **Cursor pagination** (doc 05) for stable, performant infinite scroll on mobile.
- Results are lightweight **view DTOs** (cover image, price, rating, distance) — full
  detail is a separate `GET /vehicles/{id}`; keeps list payloads small for mobile.

## 13.7 Recommendations

Beyond search, recommendation surfaces:
- **"Near you", "Popular in {city}", "For your trip", "Because you viewed X".**
- Computed by async jobs (analytics rollups + collaborative signals) into precomputed
  recommendation sets cached in Redis, refreshed periodically — never computed
  synchronously in the request.
- Same event substrate feeds these; recommendations is a read-mostly module consuming
  precomputed data.

## 13.8 Maps integration (server-side, cached)

The `maps` module wraps Google Maps (Geocoding, Reverse Geocoding, Places
Autocomplete, Distance Matrix, Directions) behind a `MapsProvider` interface, with:
- **Server-side keys** (restricted, never shipped in the app) to control cost/quota.
- **Aggressive caching** in Redis: geocodes and place lookups are highly repetitive;
  caching slashes cost and latency and protects against quota exhaustion.
- **Circuit breaker + fallback:** if Maps is slow/over-quota, non-critical features
  degrade (e.g. approximate distance) rather than failing the request.
- Used by: search (geocode the query area, airport coords), delivery fee (distance),
  trip (directions/ETA).

## 13.9 Performance summary

- Geo + compound indexes for O(index) candidate retrieval.
- Redis availability cache to avoid per-vehicle calendar scans.
- Cursor pagination to avoid deep-offset scans.
- Cached maps + recommendation sets to avoid synchronous external/heavy work.
- Adapter boundary so the whole thing can move to a dedicated search cluster when the
  P2P catalog grows into the millions-of-listings range (marketplace + fleet future).
