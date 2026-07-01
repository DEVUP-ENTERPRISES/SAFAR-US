# 12 — Notification Engine

Notifications are **event-driven, multi-channel, templated, queued, and retriable**.
No module ever sends a notification synchronously in a request path. Something happens
→ a domain event fires → the notification module decides what/whom/how to notify →
delivery is queued and reliably attempted.

## 12.1 Architecture

```
Domain Event (e.g. BookingConfirmed)
        │  (via outbox → event bus)
        ▼
Notification Orchestrator (subscribes to events)
        │  1. Resolve recipients (guest, host)
        │  2. Load user notification preferences + locale
        │  3. Select template(s) per channel
        │  4. Respect quiet hours / channel opt-outs / dedupe
        ▼
Enqueue per-channel jobs (BullMQ)
   ┌────────────┬────────────┬────────────┬────────────┐
   ▼            ▼            ▼            ▼            
push(FCM)    email(SES)    sms         in-app(socket + feed)
   │            │            │            │
   └── delivery log (notifications collection) ── status, retries, providerRef
```

**Why event-driven, not direct calls:** the booking module should not know that a
confirmation triggers a push + email + in-app entry. It emits one fact; the
notification module owns the policy of how people are told. Add a WhatsApp channel
later? Only the notification module changes.

## 12.2 Channels

- **Push (FCM):** targeted by device `fcmToken` (multi-device fan-out). Data +
  notification payloads; deep-links into the app (booking, trip, chat).
- **Email (AWS SES):** transactional (receipts, confirmations, KYC, payout) with
  HTML+text templates; separate config for marketing (different reputation/domain).
- **SMS:** high-value/urgent only (OTP, trip start, critical alerts) — SMS is
  expensive and rate-abused, so it's reserved and tightly monitored.
- **In-app / real-time:** written to the `notifications` feed (badge, list) and pushed
  live via Socket.IO if the user is connected (doc 15).

## 12.3 Templates

- `notification_templates` keyed by `(key, channel, locale)`, versioned, Handlebars-
  style variables. Editable by ops without deploy.
- **Localization** first-class: recipient locale selects the template; fallback to
  default locale.
- Rendering is validated against declared `variables` so a template can't reference
  data that isn't provided.
- Separation of **content** (template) from **trigger** (event mapping) from
  **delivery** (channel worker) — three independently changeable concerns.

## 12.4 Queues, retries, and reliability

- Each channel is its own **BullMQ queue** with tuned concurrency (email can be
  parallel; SMS throttled to provider limits).
- **Retry policy:** exponential backoff with jitter, capped attempts. Transient
  provider errors (5xx, timeouts) retry; permanent errors (invalid token/number) do
  not — they mark the delivery failed and, e.g., prune a dead FCM token.
- **Dead-letter queue:** exhausted jobs land in a DLQ for inspection/alerting, never
  silently lost.
- **Idempotency/dedupe:** an event + recipient + template within a window won't send
  twice (guards against double event delivery).
- **Delivery log:** every attempt recorded in `notifications` with status
  (`queued→sent→delivered→read`/`failed`), provider reference, and error — full
  observability and support traceability.

## 12.5 Preferences & compliance

- Users control channel opt-ins per category (`preferences.notifications`).
  Transactional/safety messages (OTP, trip, payment) may override marketing opt-outs
  as legally allowed; marketing strictly honors opt-out and unsubscribe.
- **Quiet hours** and frequency caps prevent spamming.
- Unsubscribe links (email) and STOP handling (SMS) update preferences automatically.

## 12.6 Real-time integration

For connected users, in-app notifications are pushed instantly via the Socket.IO
`notifications` namespace (doc 15) using the realtime emitter — so the app badge and
feed update live without polling, while the same notification is persisted to the feed
for when they return.

## 12.7 Why this scales & extracts cleanly

- The notification module depends on **nothing synchronously** — it only consumes
  events and calls provider adapters. It is therefore the **easiest module to extract
  into a standalone Notification Service**: point it at the same event stream (Kafka
  later) and it works unchanged.
- Provider adapters (FCM/SES/SMS) sit behind interfaces, so swapping SES→SendGrid or
  adding WhatsApp/Slack is an adapter, not a rewrite.
- Because delivery is fully queued, a provider outage degrades gracefully (jobs
  retry/queue up) without impacting the API or user-facing latency.
