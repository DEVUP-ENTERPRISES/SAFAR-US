# Store submission notes

For whoever fills in the Google Play Console and App Store Connect forms. Both apps share one account system, so most answers are the same; differences are marked.

## Links the forms ask for

| Field | Value |
|---|---|
| Privacy policy | https://www.catodrive.com/privacy |
| Account deletion (web) | https://www.catodrive.com/delete-account |
| Terms | https://www.catodrive.com/terms |
| Support | https://www.catodrive.com/support |

In-app deletion: Account → Delete account (CatoDrive), Menu → Delete account (CatoDrive Partner). Both call the same server endpoint as the website's `/account/delete`.

## Data safety (Google Play) / App Privacy (Apple)

Nothing is sold or shared for advertising. The apps contain no analytics, advertising or crash-reporting SDKs. All data is encrypted in transit (HTTPS only). Users can request deletion (see above).

| Data type | Collected | Why | Shared with |
|---|---|---|---|
| Name, email, phone | Yes, required | Account, bookings, trip contact | — |
| Date of birth, address | Yes (guests, at account setup) | Rental age and insurance rules | — |
| Government ID and selfie | Yes (guests) | Identity check before a trip | Stripe Identity (processor) |
| Payment card | Entered in Stripe’s own sheet; the app never sees the number | Payments, deposits | Stripe (processor) |
| Precise location | Yes, foreground only, only during an active trip or handover, and on condition photos | Trip tracking, delivery, photo evidence | — |
| Photos | Yes (car condition, documents, profile) | Trip evidence, listings, documents | — |
| Messages | Yes | Guest–host chat, support tickets | — |
| Device push token | Yes | Notifications | Firebase Cloud Messaging / Apple Push (delivery only) |
| Partner app only: bank/payout details | Entered in Stripe’s hosted onboarding | Payouts | Stripe (processor) |
| Partner app only: toll-agency login | Yes, stored encrypted, never shown again | Matching tolls to trips | The toll agency (NTTA) |

Background location is blocked in the build (`ACCESS_BACKGROUND_LOCATION` is in the blocked list). Microphone is not requested.

## Permissions and why

| Permission | Reason shown to the user |
|---|---|
| Camera | Photograph the car at pickup and return, documents, and (Partner) listing photos |
| Photo library | Choose photos already taken |
| Location (while in use) | Record where pickup and return photos were taken; live trip tracking |
| Notifications | Booking, trip and message alerts |

## Reviewer access

Reviewers need one signed-in account per app, with something to look at:

- **CatoDrive:** a guest account with a completed past trip and verified identity.
- **CatoDrive Partner:** a host account with at least one listed car and one past trip.

These must be real accounts on production, created by the business and entered only in the store consoles - never committed here.

## Build and release

- `eas build --profile preview` (internal APK for testing), `eas build --profile production` (store bundle; version code auto-increments).
- Each app needs its own EAS project; set `EAS_PROJECT_ID`, and for Android push `GOOGLE_SERVICES_JSON`, as EAS environment variables for that project.
- JavaScript-only changes ship as over-the-air updates on the `production` channel; anything touching native modules needs a new store build. The minimum supported version is set in the admin panel (Mobile apps), which shows the update screen to anyone older.
