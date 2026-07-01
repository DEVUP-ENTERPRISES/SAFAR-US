# 16 — Mobile App (Flutter)

Single Flutter codebase → Android + iOS. The app mirrors the backend's discipline:
**Clean Architecture, feature-first structure, strict typing, dependency injection,
and a clear separation between UI, domain, and data.** The app is a thin, resilient
client over the API — business rules live on the server; the app orchestrates UX,
offline resilience, and realtime.

## 16.1 Layered Clean Architecture (per feature)

```
Presentation  (Widgets + State/BLoC/Riverpod)   ← depends on → Domain
Domain        (Entities, UseCases, Repository interfaces)  ← pure, no Flutter/HTTP
Data          (Repository impls, Remote/Local data sources, DTOs, mappers)  → implements Domain
```
Dependencies point inward (same rule as backend). The **domain layer is pure Dart** —
no Flutter, no HTTP — so business/use-case logic is unit-testable and UI-independent.

## 16.2 Project structure (feature-first)

```
lib/
├── main.dart                     # entrypoint; runs App with configured DI + flavor
├── app/
│   ├── app.dart                  # MaterialApp, theme, router, localization
│   ├── router/                   # go_router config; route guards (auth/role)
│   ├── theme/                    # design tokens, light/dark, typography
│   └── di/                       # get_it/injectable service locator setup
│
├── core/                         # cross-cutting, framework-level
│   ├── network/                  # Dio client, interceptors (auth, retry, logging, error map)
│   ├── error/                    # Failure types, exception→failure mapping, Result<T>
│   ├── storage/                  # secure storage (tokens), local cache (Hive/Isar)
│   ├── realtime/                 # socket_io_client wrapper, reconnection, room mgmt
│   ├── location/                 # geolocation, permissions, background location (trips)
│   ├── notifications/            # FCM setup, local notifications, deep-link routing
│   ├── payments/                 # Stripe SDK (PaymentSheet, Apple/Google Pay) wrapper
│   ├── maps/                     # Google Maps widget wrappers, markers, clustering
│   ├── config/                   # flavors (dev/staging/prod), env, feature-flag client
│   └── utils/                    # formatters (money, date, distance), validators
│
├── features/                     # one folder per feature — mirrors backend modules
│   ├── auth/
│   │   ├── presentation/         # screens, widgets, state (login, otp, oauth)
│   │   ├── domain/               # entities, usecases (Login, VerifyOtp, RefreshToken), repo iface
│   │   └── data/                 # repo impl, remote datasource, DTOs, mappers, local token store
│   ├── onboarding/
│   ├── home/
│   ├── search/                   # map + list, filters, autocomplete
│   ├── vehicle_detail/
│   ├── booking/                  # quote → book → manage
│   ├── trip/                     # handover, live map, return, status
│   ├── payments_wallet/
│   ├── host/                     # listing mgmt, calendar, pricing, host dashboard
│   ├── chat/
│   ├── reviews/
│   ├── notifications/
│   ├── profile/
│   ├── kyc/
│   └── support_claims/
│
├── shared/                       # reusable widgets (buttons, cards, sheets, shimmer, empty states)
│   ├── widgets/
│   └── models/                   # shared value types (Money, GeoPoint) mirroring backend VOs
│
└── l10n/                         # ARB localization files (multi-language ready)
```

**Why feature-first (not layer-first):** a feature is a vertical slice you can build,
test, and reason about in isolation — exactly like backend modules. New engineers work
within one feature folder; features don't reach into each other's internals.

## 16.3 State management

- **Riverpod** (or BLoC) for predictable, testable state. Chosen for compile-safe
  providers, easy testing (override providers), and no `BuildContext` coupling in
  logic.
- UI reacts to state (loading/data/error) exposed by view models/notifiers that invoke
  **use cases**; UI never calls the network directly.
- Server state is cached; screens render from cache first (instant) then refresh
  (stale-while-revalidate) for perceived speed.

## 16.4 Networking layer

- **Dio** HTTP client with interceptors:
  - **Auth interceptor:** attaches access token; on `401`, transparently calls
    refresh-token rotation once and retries the request (queues concurrent 401s so we
    refresh only once).
  - **Retry interceptor:** exponential backoff for idempotent GETs / network blips.
  - **Idempotency interceptor:** attaches an `Idempotency-Key` (UUID) to booking/
    payment POSTs and reuses it across retries.
  - **Error mapper:** maps the backend error envelope `code` → typed `Failure` the UI
    can branch on (localized messages).
  - **Logging/telemetry** (dev builds; redacted).
- **Generated client:** DTOs/endpoints generated from backend **OpenAPI** → no manual
  drift, typed responses.

## 16.5 Auth & secure storage

- Access token in memory; refresh token in **flutter_secure_storage** (Keychain /
  Keystore). Never in shared prefs.
- Biometric unlock (optional) gates app open / sensitive actions.
- Google/Apple sign-in via native SDKs → send `id_token` to backend (backend verifies).
- Multi-device aware: device registers its FCM token; user can see/revoke sessions.

## 16.6 Realtime & location

- Socket wrapper connects post-auth, joins rooms (`trip:<id>`, `user:<id>`), auto-
  reconnects, and re-syncs via REST catch-up on reconnect (doc 15).
- During an **active trip**, background/foreground location streams (throttled) to the
  `/trip` namespace; permissions handled gracefully with clear rationale prompts and
  degradation if denied.

## 16.7 Payments

- **Stripe Flutter SDK**: PaymentSheet for cards, native **Apple Pay / Google Pay**.
  Card data never touches TURA — SDK tokenizes on-device; app confirms the
  PaymentIntent (handles 3-D Secure) created by the backend.

## 16.8 Offline & resilience

- Read caches (Hive/Isar) for home, search results, bookings → app is useful on flaky
  networks; writes queue and retry with idempotency keys.
- Optimistic UI where safe (e.g. sending a chat message) with reconciliation on ack.
- Graceful degradation: maps/search fall back to last-known data; clear offline
  banners.

## 16.9 Feature flags & config

- The app reads feature flags from the backend (`feature-flags` module) at launch/
  refresh → progressive rollout, kill-switches, and A/B tests without an app-store
  release. Flavors (dev/staging/prod) point at the right API base URL & keys.

## 16.10 Quality & CI

- **Layered tests:** unit (domain use cases, pure Dart), widget tests (UI states),
  integration tests (flows against a mock/staging API).
- **CI (GitHub Actions):** analyze (very_good_analysis lints, strict), test, build
  Android (AAB) + iOS (IPA), distribute to Firebase App Distribution / TestFlight;
  release builds to Play/App Store on tagged releases.
- **Strict Dart analysis**, null-safety, no dynamic, immutable models (freezed) →
  mirrors the backend's "strict typing, no spaghetti" mandate.

## 16.11 Why this mirrors the backend (deliberately)

Feature-first + Clean Architecture on both sides means the mental model is shared:
"booking" is a folder on the server and a folder in the app, with matching DTOs
(generated from one OpenAPI source). This reduces cognitive load, keeps contracts in
lockstep, and makes the whole system — server and client — evolve together cleanly as
new business lines (fleet, corporate, EV) add matching features on both sides.
