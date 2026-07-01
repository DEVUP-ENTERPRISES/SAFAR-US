# 07 — Role-Based Access Control

## 7.1 Model: RBAC + scopes + policies (not just roles)

Pure role checks (`if role === 'admin'`) do not survive a multi-tenant, multi-line
platform. We use a three-layer model:

1. **Permissions** — atomic capabilities: `booking:cancel:any`, `vehicle:verify`,
   `payout:run`. This is what code checks. Roles are just bundles of permissions.
2. **Roles** — named bundles of permissions assigned to users. Adding a capability to
   a role never requires a code change.
3. **Scopes + Policies** — *where* a permission applies (this org, this fleet) and
   *ownership* rules ("cancel your **own** booking"). Handled by per-module policy
   objects that inspect the actual resource.

**Why permissions, not role-name checks:** when Finance Admin should suddenly also
issue refunds, you grant `payment:refund` to the Finance role in data — no deploy. It
also means new roles (e.g. "Regional Ops Lead") are pure data.

## 7.2 Roles

| Role | Purpose | Representative permissions |
|---|---|---|
| **Guest** | default authenticated user; can book | `booking:create`, `booking:cancel:own`, `review:create:own`, `vehicle:list:own` (may also host) |
| **Host** | lists vehicles, manages own supply | Guest + `vehicle:create`, `vehicle:update:own`, `availability:manage:own`, `booking:confirm:own`, `payout:read:own` |
| **Fleet Manager** | manages a fleet's vehicles (scoped) | Host perms scoped to `fleetId`; `fleet:manage`, `vehicle:bulk`, `analytics:read:fleet` |
| **Corporate Admin** | manages an org's mobility (scoped) | `corporate:manage`, `booking:read:org`, `policy:manage`, `invoice:read:org`, `member:manage:org` |
| **Support Agent** | handles tickets/disputes | `ticket:read:any`, `ticket:respond`, `booking:read:any`, `user:read:any`, `refund:request` (not approve) |
| **Moderator** | trust & safety over content | `review:moderate`, `vehicle:flag`, `user:suspend`, `media:remove` |
| **Finance Admin** | money operations | `payment:refund`, `payout:run`, `ledger:read`, `invoice:manage`, `coupon:manage` |
| **Operations Admin** | supply/verification ops | `vehicle:verify`, `host:verify`, `kyc:review`, `claim:assign` |
| **Developer** | technical/system | `feature-flag:manage`, `settings:manage`, `audit:read`, `system:read` (no money/PII write) |
| **Super Admin** | break-glass, full access | `*` (all) — tightly limited membership, MFA-required, every action audited |

Users can hold **multiple roles** (a person is a Guest + Host; an employee is Support
Agent + Moderator). Effective permissions = union of all role permissions, filtered
by scope.

## 7.3 Permission taxonomy

Format: `resource:action[:scope]`

- **resource:** `booking`, `vehicle`, `user`, `host`, `payment`, `payout`, `refund`,
  `review`, `claim`, `ticket`, `kyc`, `feature-flag`, `settings`, `audit`, `fleet`,
  `corporate`, `coupon`, `analytics`, `media`, `document`.
- **action:** `create`, `read`, `update`, `delete`, `list`, plus domain verbs
  (`confirm`, `cancel`, `verify`, `refund`, `run`, `moderate`, `suspend`, `assign`,
  `review`).
- **scope:** `own` (actor's resource), `org` (actor's organization), `fleet` (actor's
  fleet), `any` (all resources). Absence of scope = the action isn't scope-sensitive.

`own`/`org`/`fleet` are resolved by **policies**, because only the resource itself
knows its owner/tenant. `any` is a role-level grant.

## 7.4 Permission matrix (excerpt)

| Permission | Guest | Host | Fleet Mgr | Corp Admin | Support | Mod | Finance | Ops | Dev | Super |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| booking:create | ✔ | ✔ | ✔ | ✔ | | | | | | ✔ |
| booking:cancel:own | ✔ | ✔ | ✔ | ✔ | | | | | | ✔ |
| booking:cancel:any | | | | | ✔¹ | | | ✔ | | ✔ |
| booking:confirm:own | | ✔ | ✔(fleet) | | | | | | | ✔ |
| booking:read:any | | | | | ✔ | ✔ | ✔ | ✔ | | ✔ |
| vehicle:create | | ✔ | ✔ | | | | | | | ✔ |
| vehicle:verify | | | | | | | | ✔ | | ✔ |
| host:verify | | | | | | | | ✔ | | ✔ |
| kyc:review | | | | | | | | ✔ | | ✔ |
| payment:refund | | | | | | | ✔ | | | ✔ |
| refund:request | | | | | ✔ | | | | | ✔ |
| payout:run | | | | | | | ✔ | | | ✔ |
| payout:read:own | | ✔ | ✔ | | | | | | | ✔ |
| review:moderate | | | | | | ✔ | | | | ✔ |
| user:suspend | | | | | | ✔ | | ✔ | | ✔ |
| feature-flag:manage | | | | | | | | | ✔ | ✔ |
| audit:read | | | | | | | ✔² | | ✔ | ✔ |
| settings:manage | | | | | | | | | ✔ | ✔ |
| analytics:read:fleet | | | ✔ | | | | | | | ✔ |
| corporate:manage | | | | ✔ | | | | | | ✔ |

¹ Support can cancel on behalf of a user only via an audited, reason-required flow.
² Finance sees financial audit slices only. Full audit = Ops/Dev/Super.

The full matrix lives as **seed data** in `database/seeders/rbac.seed.ts` and is the
authoritative source; this table is documentation.

## 7.5 How enforcement works at runtime

1. On login, the user's roles → union of permissions is computed and **cached in the
   session (Redis)** and embedded (compactly) in the JWT for fast, DB-free checks.
2. `authorize('booking:cancel')` middleware checks the permission set. If the
   permission is `:own`/`:org`/`:fleet`-scoped, it hands off to the module policy:
   `bookingPolicy.canCancel(principal, booking)` which loads the booking and verifies
   `booking.guestId === principal.userId` (own) or org/fleet membership.
3. **Scoped roles** (`user_roles.scope = { fleetId }`) mean a Fleet Manager's
   permissions apply only to vehicles/bookings within that fleet — the policy checks
   `vehicle.fleetId ∈ principal.scopedFleetIds`.
4. **Fail closed.** No matching permission, or a policy that can't confirm ownership →
   `403`. Ambiguity is denial.

**Cache invalidation:** when an admin changes a role's permissions or a user's roles,
we emit `UserRoleChanged`/`RolePermissionsChanged`; the auth module invalidates
affected sessions' cached permission sets (and can force token refresh). This keeps
authz both fast (cached) and correct (invalidated on change).

## 7.6 Future-proofing for multi-tenancy (Fleet SaaS / Corporate)

The `scope` dimension is what lets the *same* RBAC engine serve:
- **P2P now:** scopes are effectively `own`/`any`.
- **Fleet SaaS / Corporate later:** `org`/`fleet` scopes partition data per tenant.
  A Corporate Admin of Org A can never see Org B — enforced by policies reading
  `scopeId`, not by separate code paths.

When we introduce full multi-tenant SaaS, we add a `tenantId` claim to the principal
and a tenant filter in the repository base — no per-module rewrite, because tenancy is
already a first-class scope in the RBAC model.
