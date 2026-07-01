# 09 — Booking Engine

The booking engine is the heart of TURA. It must be **correct** (no double-booking,
no lost money), **fair** (deterministic cancellation/refund), and **observable**
(every transition auditable). It is modeled as an explicit **state machine**, not
scattered boolean flags — because "is this booking cancellable right now?" must have
one authoritative answer.

## 9.1 Two entities: Booking vs Trip

- **Booking** = the *commercial reservation*. Exists from the moment a guest requests/
  books until it is completed or cancelled. Owns money, dates, approval, cancellation.
- **Trip** = the *physical rental*. Created when the booking starts (handover). Owns
  odometer, live location, fuel, condition, return.

Separating them keeps concerns clean: a booking can be cancelled before any trip
exists; a trip's live-location churn never bloats the commercial record; and future
lines (fleet, corporate) reason about bookings while operations reason about trips.

## 9.2 Booking status state machine

```
                       ┌─────────────┐
   create (request)    │   PENDING   │  (request-to-book: awaiting host)
 ─────────────────────▶│  _APPROVAL  │
                       └──────┬──────┘
             host declines /  │  host confirms
             deadline expires │
                    ┌─────────┴─────────┐
                    ▼                   ▼
             ┌────────────┐      ┌────────────┐
             │  DECLINED  │      │  CONFIRMED │◀── (instant book: create → here directly,
             └────────────┘      └─────┬──────┘         after successful payment auth)
             ┌────────────┐            │ payment captured / hold placed
             │  EXPIRED   │            ▼
             └────────────┘      ┌────────────┐
                                 │    PAID    │  (funds secured; awaiting trip start)
                                 └─────┬──────┘
                     guest/host cancel │  trip start (handover)
                    ┌──────────────────┼───────────────────┐
                    ▼                  ▼                    │
             ┌────────────┐     ┌────────────┐             │
             │ CANCELLED  │     │ IN_PROGRESS│◀────────────┘ (Trip active)
             │ (+refund)  │     └─────┬──────┘
             └────────────┘           │ trip return + finalize
                                      ▼
                                 ┌────────────┐   dispute opened   ┌────────────┐
                                 │ COMPLETED  │───────────────────▶│  DISPUTED  │
                                 └─────┬──────┘                    └─────┬──────┘
                                       │ payout window elapses           │ resolved
                                       ▼                                 ▼
                                 (payout scheduled)                 (COMPLETED/adjusted)
```

**Allowed transitions are declared as data** (`booking-status.enum.ts` +
transition map). The entity's `transitionTo(next, ctx)` method throws
`IllegalTransitionError` for anything not in the map. Every transition appends to
`statusHistory` with `{from,to,at,by,reason}`. **Why a declarative map:** it makes the
lifecycle auditable, testable in isolation, and impossible to shortcut from a random
controller.

### Status meanings
- **PENDING_APPROVAL** — request-to-book listing; host must accept within
  `approvalDeadline` (e.g. 24h or before trip start, whichever first).
- **CONFIRMED** — booking accepted; payment authorized but perhaps not captured.
- **PAID** — funds captured/held (incl. security deposit auth-hold).
- **IN_PROGRESS** — trip active (handover done).
- **COMPLETED** — vehicle returned, finalized; eligible for payout + reviews.
- **CANCELLED** — ended before completion; triggers refund per policy.
- **DECLINED / EXPIRED** — host rejected / didn't act in time; hold released, no
  charge.
- **DISPUTED** — claim/dispute suspends payout until resolved.

## 9.3 Two booking modes

- **Instant Book** (`vehicle.listing.instantBook = true`): create → authorize payment
  → `CONFIRMED`/`PAID` immediately (no host approval step). Lower friction, higher
  conversion.
- **Request to Book:** create → `PENDING_APPROVAL` → host confirms/declines.
  Payment is **authorized** (hold) at request time and **captured** only on
  confirmation; declined/expired → hold released (guest never truly charged).

## 9.4 Create-booking flow (the critical transaction)

The hard problem: **prevent double-booking under concurrency** while coordinating
availability, pricing, and payment. Sequence:

```
1. VALIDATE request (dates valid, in future, within min/max trip length, vehicle bookable).
2. QUOTE price (Pricing contract) — recompute server-side; never trust client price.
3. PLACE HOLD on availability (Availability contract) with a short TTL:
     - Atomic conditional write: mark the date-range HELD only if currently AVAILABLE.
     - Uses optimistic version / unique index on (vehicleId, date) to reject overlaps.
     - If any day in range isn't available → ConflictError (409) "no longer available".
4. CREATE PaymentIntent (Payment contract):
     - Instant book → authorize + capture (or authorize now, capture at start).
     - Request-to-book → authorize only (hold funds).
     - Security deposit → separate auth-hold.
5. PERSIST booking + WRITE OUTBOX event  ── all inside ONE Mongo transaction:
     - insert booking (status per mode)
     - convert HELD → BOOKED on the calendar (or keep HELD until payment confirmed)
     - write outbox row: BookingCreated / BookingConfirmed
     - store idempotency result
6. COMMIT. Return booking.
7. ASYNC (via outbox → workers): notify host & guest, update search/availability
   caches, analytics.
```

**Why hold-then-confirm instead of "just insert and catch duplicate":** the hold
reserves the slot for the seconds needed to talk to Stripe, so two guests racing for
the last slot can't both succeed. The hold has a TTL; a cron
(`expire-pending-bookings`) releases holds/bookings that never completed payment,
returning inventory. The unique `(vehicleId, date)` index is the ultimate backstop:
even if application logic had a bug, the database refuses two `BOOKED` rows for the
same slot.

**Idempotency:** the whole create is guarded by `Idempotency-Key` (doc 05 §5.6) so a
mobile client retrying on flaky network never creates two bookings or double-charges.

**Concurrency control:** availability writes use optimistic locking (`version`) +
unique index; the create runs in a transaction so a mid-flight crash leaves no
half-booked state (either everything commits or nothing does). For extremely hot
vehicles we can additionally take a Redis distributed lock on `vehicleId` to serialize
contenders and reduce transaction aborts.

## 9.5 Host approval flow (request-to-book)

- On create → `PENDING_APPROVAL`, funds authorized, `approvalDeadline` set, host
  notified (push/email/socket).
- Host `confirm` → capture payment, `CONFIRMED`→`PAID`, calendar `HELD`→`BOOKED`,
  notify guest.
- Host `decline` or deadline passes (cron) → `DECLINED`/`EXPIRED`, release auth-hold
  and calendar hold, notify guest, suggest alternatives (search).

## 9.6 Trip lifecycle

```
scheduled → handover_pending → active → return_pending → completed
                                   └──────────────► disputed (if claim)
```
- **Handover:** both parties record odometer, fuel, condition photos, e-signatures,
  geolocation (proof of state). Trip → `active`, booking → `IN_PROGRESS`.
- **During trip:** live location streamed via Socket.IO (doc 15); guest can request
  **extension** (§9.9).
- **Return:** record end odometer/fuel/photos; compute overages (mileage, fuel, late
  return). Trip → `completed`, booking → `COMPLETED`.
- **Finalize:** capture any overage charges / release or capture deposit; open review
  window; schedule payout after the payout-hold window.

## 9.7 Cancellation flow

Cancellation is **policy-driven**, not ad hoc. A cancellation policy (per listing:
Flexible / Moderate / Strict) maps *time-before-trip* → *refund percentage*.

```
cancel(bookingId, actor, reason):
  1. Load booking; assert transition PAID/CONFIRMED → CANCELLED is legal.
  2. Determine who cancelled (guest vs host) — host cancellation has penalties.
  3. Compute refund via CancellationPolicy(booking, now):
        guest-initiated: refund = f(hoursUntilStart, policyTier)
        host-initiated:  full guest refund + host penalty + relist assistance
  4. In ONE transaction:
        - booking → CANCELLED, record cancellation{by,at,reason,refund}
        - release availability (BOOKED → AVAILABLE), so others can book
        - write REFUND ledger entries (double-entry) + outbox RefundRequested
  5. ASYNC: Payment worker executes Stripe refund; on success emits PaymentRefunded;
        wallet/ledger reconciled; notify both parties.
```

**Why refund is computed in-transaction but executed async:** the *decision* (how
much) must be atomic with the state change and recorded in the ledger immediately;
the *movement* of money (Stripe API call) is a slow external side effect that must be
retriable — so it's a job. The ledger records the obligation; the payout/refund worker
settles it.

## 9.8 Refund flow (money correctness)

- Every refund is a **balanced double-entry** in the ledger (debit platform/host
  payable, credit guest wallet or original payment method) before any external call.
- Refund to original method via Stripe **or** to TURA wallet (faster, encourages
  re-booking) — policy/UX choice, both fully ledgered.
- Partial refunds (policy tiers, overage disputes) are first-class.
- Idempotent: refund jobs carry the booking/txn id so retries never double-refund
  (Stripe idempotency key + our ledger check).

## 9.9 Extension flow

```
requestExtension(tripId, newEnd):
  1. Check availability for [oldEnd, newEnd] (Availability contract) — must be free.
  2. Quote incremental price (Pricing).
  3. Place hold on the extra range; authorize incremental payment.
  4. On success: extend booking.period.end + calendar, capture funds, notify host.
  5. On unavailability: reject with alternatives.
```
Extensions reuse the same hold-then-charge primitives as create — no special-case
money path.

## 9.10 Money & event summary for a booking

| Moment | Ledger effect | Event emitted |
|---|---|---|
| Create (instant) | authorize/capture; deposit hold | `BookingCreated`, `PaymentAuthorized` |
| Host confirm | capture | `BookingConfirmed`, `PaymentCaptured` |
| Trip complete | release deposit / capture overages | `TripCompleted`, `BookingCompleted` |
| Payout window ends | credit host payable → schedule payout | `PayoutScheduled` |
| Cancel | refund entries per policy | `BookingCancelled`, `RefundRequested` |
| Dispute | freeze payout | `ClaimOpened` (from claims) |

Consumers of these events: notifications, analytics, search cache, payouts, reviews
eligibility. The booking module **does not call them** — it emits and moves on. That
decoupling is what lets each of those become a separate service later.

## 9.11 Edge cases explicitly handled

- **Double booking race** → hold + unique index + transaction (§9.4).
- **Payment succeeds but app crashes before commit** → transaction rollback +
  Stripe webhook reconciliation; orphan authorizations auto-expire; a reconciliation
  job matches Stripe intents to bookings.
- **Host never responds** → expiry cron releases hold + funds.
- **Guest no-show / host no-show** → trip module records; support/claims flow; policy
  determines charges.
- **Timezone correctness** → all periods stored UTC + the vehicle's local timezone;
  "day" boundaries for pricing/availability computed in the vehicle's tz, not the
  server's.
- **Clock/retry safety** → idempotency keys on every mutating call.
