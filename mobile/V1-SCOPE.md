# CatoDrive apps: v1 scope (web parity)

Every app screen copies a website page: same flow, same rules, same copy. Status:
`todo` · `built` (type-checks and bundles) · `verified` (run on a device against the API) · `web` (opens the website page in the in-app browser, by design).

Shared logic is synced from `frontend/src` by `npm run sync:api` (see `tools/sync-web.js`); `npm run check:api` fails when the apps drift from the website.

Nothing below is `verified` yet: that needs a device run against the live API with real test accounts.

## App 1: CatoDrive (`apps/customer`, `com.catodrive.app`) for guests

| Web route | App screen | Status |
|---|---|---|
| `/` | Home tab | built |
| `/search` | Search tab | built |
| `/vehicles/[id]` | `vehicles/[id]` (with ask-the-host) | built |
| `/vehicles/[id]` checkout | `vehicles/[id]/checkout` | built |
| `/hosts/[id]` | `hosts/[id]` | built |
| `/compare` | `compare` (tray on every car card) | built |
| `/wishlist` | Saved tab | built |
| `/bookings` | Trips tab | built |
| `/bookings/[id]` | `bookings/[id]` | built |
| `/bookings/[id]/receipt` | `bookings/[id]/receipt` | built |
| `/bookings/[id]/rebook` | `bookings/[id]/rebook` | built |
| `/trips/[id]` | `trips/[id]` | built |
| `/messages` | Inbox tab, `messages/[bookingId]` | built |
| `/account` | Account tab + profile, addresses, contacts, security, payments | built |
| `/account/setup` | `account/setup` | built |
| `/account/verify-identity` | `account/verify-identity` | built |
| `/account/notifications` | `account/notifications` | built |
| `/saved-searches` | `saved-searches` | built |
| `/wallet` | `wallet` | built |
| `/citations` | `citations` | built |
| `/claims`, `/claims/[id]` | `claims`, `claims/[id]` | built |
| `/support`, `/support/[id]` | `support`, `support/[id]` | built |
| `/help`, `/help/[slug]`, `/help/photo-guide` | `help`, `help/[slug]`, `help/photo-guide` | built |
| `/contact` | `contact` | built |
| `/login`, `/register`, `/forgot-password` | `login`, `register`, `forgot-password` | built |
| `/account/delete` | `account/delete` | built |
| `/membership`, `/rewards`, `/referral` | same, behind the admin programme switches | built |
| `/legal`, `/terms`, `/privacy` | links from the account menu | web |
| `/about`, `/insurance`, `/investors`, `/calculator`, `/verify/[id]` | marketing / public pages | web |

## App 2: CatoDrive Partner (`apps/partner`, `com.catodrive.partner`) for hosts, captains, asset partners, corporate admins

| Web route | App screen | Status |
|---|---|---|
| `/host/login`, `/corporate/login` | `login` (one sign-in, workspace picked from the account; switch in the menu) | built |
| `/host` | Host · Dashboard tab | built |
| `/host/trips` | Host · Trips tab (booked, history, fleet calendar) | built |
| `/host/trips/[bookingId]` | `host/trips/[bookingId]` (request, handover checklist, end/confirm return, charges, claims, chat, help) | built |
| `/host/trips/[bookingId]/photos`, `/receipt` | `host/trips/[bookingId]/photos`, `/receipt` | built |
| `/host/listings`, `/host/listings/[id]` | Host · Listings tab, `host/listings/[id]` | built |
| `/host/listings/[id]/pricing`, `/insights` | `host/listings/[id]/pricing`, `/insights` | built |
| `/host/listings/new` | `host/listings/new` | built |
| `/host/listings/import` | `host/listings/import` (with Wheelbase import) | built |
| `/host/earnings` | Host · Earnings tab | built |
| `/host/inbox`, `/host/inquiries/[vehicleId]/[guestId]` | Host · Inbox tab, inquiry thread | built |
| `/host/profile` | `host/profile` (from Menu) | built |
| `/host/operations`, `/host/performance`, `/host/fleet`, `/host/team`, `/host/tolls` (+ new, `[id]`) | Menu screens | built |
| `/captain` | `captain` | built |
| `/host/bridge`, `/host/accept-invite` | sign-in bridge and captain invite links | web |
| `/asset-partners/dashboard` | Partner · Dashboard tab | built |
| `/asset-partners/vehicles`, `/vehicles/[id]` | Partner · Vehicles tab, `asset-partners/vehicles/[id]` | built |
| `/asset-partners/statements` | Partner · Earnings tab | built |
| `/asset-partners/maintenance` | Partner · Repairs tab | built |
| `/asset-partners/documents` | Partner · Docs tab | built |
| `/asset-partners/profile` | Partner · Profile tab | built |
| `/asset-partners/apply` | application form | web |
| `/corporate` | Corporate · Dashboard tab | built |
| `/corporate/approvals`, `/members`, `/invoices` | Corporate tabs | built |
| `/corporate/cost-centers`, `/policy` | from Corporate · Menu | built |
| Account deletion | `account/delete` | built |

## Known gaps (not parity blockers, but worth knowing)

| Gap | Why |
|---|---|
| Maps (car location map, delivery coverage map) | Needs a Google Maps Android/iOS key in EAS; lists and address search work without it |
| Google and Apple sign-in | Not in the apps yet: email, password and one-time code work; social sign-in needs the native client IDs first |
| iOS push | Needs the APNs key / Firebase iOS app |
| PDF trip documents on Android | Images show in the secure viewer; PDFs point to catodrive.com |
| Listing wizard draft | Kept while the app is open; the website also keeps it across a browser restart |

## Store readiness

| Item | Status |
|---|---|
| In-app account deletion (server `POST /me/erase` with blockers) | built |
| Website `/account/delete` and public `/delete-account` page | built |
| Legal pages linked from the account menu | built |
| Permissions: camera, photos, foreground location, notifications only; blocked list in `packages/core/app-config.js` | built |
| Distinct icons, adaptive icons, splash per app | built |
| `eas.json` profiles (preview APK, production AAB) | built |
| Data safety answers | written, see `STORE-LISTING.md` |
| Reviewer demo accounts (one per app) | todo (needs real accounts from the business) |
| EAS projects, `EAS_PROJECT_ID`, `GOOGLE_SERVICES_JSON` | todo (needs the Expo and Firebase accounts) |
