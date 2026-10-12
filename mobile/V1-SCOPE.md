# CatoDrive apps: v1 scope (web parity)

Every app screen copies a website page: same flow, same rules, same copy. Status:
`todo` · `built` (type-checks and bundles) · `verified` (run on a device against the API) · `web` (opens the website page in the in-app browser, by design).

Shared logic is synced from `frontend/src` by `npm run sync:api` (see `tools/sync-web.js`); `npm run check:api` fails when the apps drift from the website.

## App 1: CatoDrive (`apps/customer`, `com.catodrive.app`) for guests

| Web route | App screen | Status |
|---|---|---|
| `/` | Home tab | todo |
| `/search` | Search tab | todo |
| `/vehicles/[id]` | `vehicles/[id]` | todo |
| `/hosts/[id]` | `hosts/[id]` | todo |
| `/compare` | `compare` | todo |
| `/wishlist` | Saved tab | todo |
| `/bookings` | Trips tab | todo |
| `/bookings/[id]` | `bookings/[id]` | todo |
| `/bookings/[id]/receipt` | `bookings/[id]/receipt` | todo |
| `/bookings/[id]/rebook` | `bookings/[id]/rebook` | todo |
| `/trips/[id]` | `trips/[id]` | todo |
| `/messages` | Inbox tab | todo |
| `/account` | Account tab | todo |
| `/account/setup` | `account/setup` | todo |
| `/account/verify-identity` | `account/verify-identity` | todo |
| `/account/notifications` | `account/notifications` | todo |
| `/saved-searches` | `saved-searches` | todo |
| `/wallet` | `wallet` | todo |
| `/citations` | `citations` | todo |
| `/claims`, `/claims/[id]` | `claims`, `claims/[id]` | todo |
| `/support` | `support` | todo |
| `/help`, `/help/[slug]`, `/help/photo-guide` | `help`, `help/[slug]` | todo |
| `/contact` | `contact` | todo |
| `/login`, `/register`, `/forgot-password` | `login`, `register`, `forgot-password` | todo |
| `/legal`, `/terms`, `/privacy` | `legal` | todo |
| Account deletion (in `/account`) | `account/delete` | todo |
| `/membership`, `/rewards`, `/referral` | same, behind the admin programme switches | todo |
| `/about`, `/insurance`, `/investors`, `/calculator`, `/captain`, `/verify/[id]` | marketing / public pages | web |

## App 2: CatoDrive Partner (`apps/partner`, `com.catodrive.partner`) for hosts, asset partners, corporate admins

| Web route | App screen | Status |
|---|---|---|
| `/host/login`, `/corporate/login` | `login` (one sign-in, workspace picked from the account) | todo |
| `/host` | Host · Dashboard tab | todo |
| `/host/trips`, `/host/trips/[bookingId]` | Host · Trips tab, `host/trips/[bookingId]` | todo |
| `/host/trips/[bookingId]/photos`, `/receipt` | `host/trips/[bookingId]/photos`, `/receipt` | todo |
| `/host/listings`, `/host/listings/[id]` | Host · Listings tab, `host/listings/[id]` | todo |
| `/host/listings/[id]/pricing`, `/insights` | `host/listings/[id]/pricing`, `/insights` | todo |
| `/host/listings/new` | `host/listings/new` | todo |
| `/host/earnings` | Host · Earnings tab | todo |
| `/host/inbox`, `/host/inquiries/[vehicleId]/[guestId]` | Host · Inbox tab, inquiry thread | todo |
| `/host/profile` | Host · Menu tab | todo |
| `/host/operations`, `/host/performance`, `/host/fleet`, `/host/team`, `/host/tolls` | menu screens | todo |
| `/host/listings/import`, `/host/bridge`, `/host/accept-invite` | bulk import and team invites | web |
| `/asset-partners/dashboard` | Partner · Dashboard tab | todo |
| `/asset-partners/vehicles`, `/vehicles/[id]` | Partner · Cars tab | todo |
| `/asset-partners/statements` | Partner · Statements tab | todo |
| `/asset-partners/maintenance` | Partner · Maintenance tab | todo |
| `/asset-partners/documents` | Partner · Documents tab | todo |
| `/asset-partners/profile` | Partner · Profile tab | todo |
| `/asset-partners/apply` | application form | web |
| `/corporate/*` (approvals, members, policy, cost centers, invoices) | Corporate workspace | todo |
| Account deletion | `account/delete` | todo |

## Store readiness

| Item | Status |
|---|---|
| In-app account deletion (server `POST /users/me/erase` with blockers) | todo |
| Public `/delete-account` page on the website | todo |
| Legal pages linked from sign-in and profile | todo |
| Permissions: camera, photos, foreground location, notifications only; blocked list in `packages/core/app-config.js` | built |
| Distinct icons, adaptive icons, splash per app | built |
| `eas.json` profiles (development, preview APK, production AAB) | todo |
| Reviewer demo accounts (one per app) | todo (needs real accounts) |
| Data safety answers | todo |
