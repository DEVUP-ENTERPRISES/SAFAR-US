# Pending features

Features that are built but switched off, half built, or agreed but not started. Update this file when one ships or is dropped.

## Paused, waiting for a board decision

| Feature | State | How to switch it back on | Decide |
|---|---|---|---|
| **Rewards (CATO points)** | Built. Paused on 2026-10-06: hidden from the footer and account menu, `/rewards` shows a "paused" notice, and redeeming is refused | Admin → Economics → "Rewards programme is on" | Points value and earn rate; whether CATO Plus keeps its "2x points" promise (the Membership page still mentions it) |
| **Refer a friend** | Built. Paused on 2026-10-06: hidden, `/referral` shows a "paused" notice, and referral codes typed at sign-up are ignored | Admin → Economics → "Refer a friend is on" | Reward amount for both sides; limits to stop abuse |
| **CATO Plus membership** | Built. Paused on 2026-10-06: hidden from the account menu and sitemap, `/membership` shows a "paused" notice, the "save with CATO Plus" offer on car pages is off, and new sign-ups are refused | Admin → Economics → "CATO Plus membership is on" | Monthly price, perks (no service fee, member discount, 2x points), and whether the points perk stays if Rewards changes |

While paused, points are still earned on trips and kept, and anyone who is already a member keeps their benefits until their period ends, so nobody loses anything when a programme returns.

## Insurance

| Feature | State | Next step |
|---|---|---|
| **Wheelbase protection plans at checkout** | Designed: Rental Shield (always included) + Essential / Basic / Premier per day, a separate insurance payment held in a "owed to Wheelbase" ledger account, a monthly payout to Wheelbase, and pickup blocked until insurance is confirmed. Tier/deductible and claims work exists on branch `feature/wheelbase-end-to-end` | Build the checkout step and the separate payment |
| **Wheelbase API connection** | API access requested. Will create, update and cancel the Wheelbase booking with the chosen plan automatically | Answer Wheelbase's security questionnaire; store the key in AWS Secrets Manager and turn on GitHub secret scanning |
| **Wheelbase partner portal** | Idea agreed: Wheelbase logs in to CatoDrive to see bookings to insure, changes, claims and statements | Confirm Wheelbase will use it, then design |
| **Bonzah (alternative / extra)** | Researched: per-day damage + liability cover that explicitly allows peer-to-peer trips in Texas | Talk to Bonzah about embedding at checkout |
| **Platform trip-liability policy** | Texas car-sharing law makes the platform responsible for owner liability during trips | Get a quote through a specialty broker |

## Building next (agreed)

| Feature | Agreed so far |
|---|---|
| **Additional driver** | Flat fee of $10–15 per trip; up to 2 extra drivers (limit enforced, not shown to guests); must be added 24 or 48 hours before pickup; each extra driver gets an invite link to verify their ID. Insurance answer pending |
| **Selfie check at pickup (extra drivers)** | The host selfie check is live for the main guest; extend it to additional drivers |
| **Toll reminders** | Weekly reminder to import the NTTA statement; automatic fetch only through an official NTTA feed or a toll-data company, never by logging in automatically |

## Small fixes waiting

- Host pricing screen rounds per-mile fees ($0.38 shows as $0.39).
- Post-trip cleaning charge ($75): keep for dirty returns or remove. The booking cleaning fee is already gone.
- Date-of-birth limit on account setup should read the admin minimum age instead of a fixed value.
