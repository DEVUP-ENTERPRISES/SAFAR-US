# 11 — Payment Engine

Money is the part of the system you cannot get wrong. The design principles:

1. **Double-entry ledger is the source of truth**, not mutable balance fields.
2. **Stripe is the money mover; our ledger is the money record.** They are reconciled,
   never assumed in sync.
3. **Every money operation is idempotent** and traceable to a booking/txn.
4. **Integer minor units + currency**, never floats.
5. **The platform never touches raw card data** (PCI scope minimized).

## 11.1 Why a double-entry ledger (not a `balance` column)

A mutable `wallet.balance` field is how startups lose money: concurrent updates race,
a crash mid-update corrupts it, and you can never answer "why is this balance what it
is?" Instead:

- Every financial event writes a **balanced set of `ledger_entries`** under one
  `txnId` where `Σdebits === Σcredits`.
- **Accounts** are logical buckets: `user_wallet:<id>`, `host_payable:<id>`,
  `platform_revenue`, `platform_tax`, `stripe_clearing`, `promo_expense`, `deposit_held`.
- A balance is **derived** = sum over an account's entries (optionally snapshotted in
  `wallets`/`payouts` for fast reads, always rebuildable).
- Entries are **immutable** — corrections are new compensating entries, never edits.

This is how Stripe, banks, and Uber model money. It gives perfect auditability,
crash-safety (append-only), and a nightly **reconciliation** that proves the books
balance and match Stripe.

### Example: a ₹5,000 confirmed booking (commission 15%, tax on fee)
```
txn: booking_paid <bookingId>
  credit stripe_clearing        5000     (money arrived at Stripe)
  debit  host_payable:<hostId>  4250     (host earns 85%)
  debit  platform_revenue        650     (commission ex-tax)
  debit  platform_tax            100     (tax on commission)
  ── Σdebit 5000 == Σcredit 5000 ✔
```
When the payout later runs: `debit stripe_clearing 4250 / credit host_payable 4250`
and a Stripe Transfer moves the funds — books stay balanced.

## 11.2 Stripe integration

- **Payment methods:** Cards, Apple Pay, Google Pay via Stripe SDK on the client;
  card data tokenized on-device (Stripe Elements / Payment Sheet). We store only
  `paymentMethodId` / `customerId` references.
- **PaymentIntents** for charges (supports SCA/3-D Secure, `requires_action` handled
  by the app). **SetupIntents** to save methods.
- **Manual capture** for request-to-book: authorize at request, capture on host
  confirm, cancel-authorization on decline/expire.
- **Security deposits:** separate authorization hold, captured only on proven damage
  (claim) else released.
- **Stripe Connect** for host payouts (each host = a connected account); funds flow
  platform → connected account via Transfers/Payouts.
- **Webhooks** (raw-body signature-verified, event-id deduped) are the **authoritative
  status source**: `payment_intent.succeeded/failed`, `charge.refunded`,
  `transfer.paid`, `payout.failed`, etc. We update our records from webhooks and
  reconcile — we never trust a client saying "it worked."

## 11.3 Payment flows

### Charge (booking)
```
createIntent(booking) → Stripe PaymentIntent (amount=total, capture per mode)
client confirms on-device (handles 3DS) → Stripe processes
webhook payment_intent.succeeded → mark payment succeeded, write booking_paid ledger txn,
   emit PaymentSucceeded → booking module transitions PAID
```

### Refund
```
booking cancel computes refund (policy) → write refund ledger txn (obligation)
   → enqueue refund job → Stripe Refund (idempotency key = refund txnId)
webhook charge.refunded → confirm, reconcile ledger, notify
```

### Wallet top-up
```
POST /wallet/topup → PaymentIntent → success webhook →
   ledger: credit stripe_clearing / debit user_wallet:<id>  (funds now spendable in-app)
```

## 11.4 Commission, taxes, fees

- **Commission:** platform take rate (e.g. 15–25%), configurable per region/host tier
  in settings/pricing — never hardcoded. Computed on the base+extras, snapshotted into
  the booking `priceBreakdown` and posted to `platform_revenue`.
- **Taxes:** jurisdiction-aware tax lines computed at quote time, posted to
  `platform_tax`; the model supports multiple tax components (GST/VAT/local). Tax
  logic is isolated so a tax provider (Stripe Tax/Avalara) can be plugged behind the
  interface later.
- **Service fees / insurance fees / delivery fees:** explicit line items in the
  breakdown, each mapped to a ledger account.

## 11.5 Host payouts

- Earnings accrue to `host_payable:<hostId>` on booking completion, but become
  **payable only after a hold window** (protects against disputes/chargebacks/claims
  — e.g. 24h after trip completion).
- A **daily payout cron** fans out `PayoutScheduled` jobs per eligible host; the
  payout worker:
  - takes a **distributed lock** (only one payout run per host at a time),
  - sums payable ledger balance, creates a `payouts` record + Stripe Transfer
    (idempotency-keyed),
  - on `transfer.paid` webhook → mark paid, post the clearing ledger txn,
  - on failure → retry with backoff, alert finance, never silently drop.
- Payout schedule (daily/weekly/instant-for-fee) is a host setting → subscription
  upsell hook.
- **Disputed bookings freeze the associated payable** until the claim resolves.

## 11.6 Wallet

- `wallets` is a **read projection** over the ledger for fast balance display,
  rebuildable at any time. All debits/credits go through ledger txns.
- Wallet can hold refunds (fast re-booking), referral rewards, promo credits, and
  top-ups. Spending from wallet at checkout is a ledger debit, not a Stripe charge.

## 11.7 Subscriptions

- Powers host-pro tiers, Fleet SaaS, and Corporate plans via **Stripe Billing**
  (Products/Prices/Subscriptions). Webhooks (`invoice.paid`,
  `customer.subscription.updated`) drive `subscriptions` state and entitlements.
- `hasEntitlement(userId, feature)` contract gates premium features (lower commission,
  instant payout, advanced analytics, white-label). This is how Fleet SaaS monetizes
  later on the same rails.

## 11.8 Split payments

- Corporate/travel bundles and multi-party trips need split settlement. The ledger
  models this natively: one inbound charge → multiple payable accounts
  (host, platform, partner, tax) in one balanced txn. Stripe Connect
  `transfer_data`/separate transfers execute the split. No special-case code — it's
  just more ledger legs.

## 11.9 Reconciliation & integrity (the safety net)

- **Nightly reconciliation job:**
  - asserts every `txnId` balances (Σdebit==Σcredit); any imbalance → alert + freeze.
  - matches our `payments`/`payouts` against Stripe balance transactions; flags drift.
  - verifies derived wallet/payable snapshots equal ledger sums; rebuilds if off.
- **Idempotency everywhere:** Stripe idempotency keys + our idempotency table + ledger
  existence checks make every charge/refund/payout safe to retry with zero risk of
  double money movement.
- **Chargebacks/disputes:** Stripe `charge.dispute.created` → open internal case,
  freeze related payout, post reserve ledger entries.

## 11.10 Contracts exposed

`createIntent`, `capture`, `refund`, `getPaymentStatus`, `credit`/`debit` (wallet),
`schedulePayout`, `hasEntitlement`. All DTO-in/DTO-out. When Payments becomes its own
service (a natural early extraction, given money's isolation needs), these contracts
become its API surface unchanged — and the ledger, being append-only and self-
contained, is one of the cleanest things to lift out.
