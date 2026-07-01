# 08 — Security Architecture

Security is layered (defense in depth): edge → transport → auth → authz → input →
data → secrets → monitoring. A failure at one layer is contained by the next.

## 8.1 Authentication tokens: the hybrid JWT + session model

Pure stateless JWTs cannot be revoked before expiry; pure DB sessions cost a lookup
on every request. We use a **hybrid**:

- **Access token (JWT, short-lived, 10–15 min):** signed, carries `userId`,
  `sessionId`, `roles`, compact `permissions`, `kid`. Verified statelessly. Its short
  life bounds the damage of theft.
- **Refresh token (opaque, long-lived, 30–60 days, rotating):** stored **hashed** in
  `sessions`. Used only at `/auth/token/refresh` to mint a new access token.
- **Session record (Redis + Mongo):** the access token's `sessionId` is validated
  against a live session on each request (cheap Redis hit). Revoking the session
  (logout, ban, suspicious activity) **immediately** kills the token despite its JWT
  validity. This is the crucial revocation lever.

### Refresh token rotation + replay detection
Every refresh issues a **new** refresh token and invalidates the old one, all within a
**token family** (`refreshTokenFamilyId`). If an **already-used** (rotated-out)
refresh token is presented, that means it was stolen and replayed → we **revoke the
entire family** (all sessions from that lineage) and flag the account. This is the
industry-standard mitigation for refresh-token theft.

### JWT signing key rotation
- Asymmetric signing (RS256/EdDSA). Private key in AWS KMS/Secrets Manager; public
  keys published so verification needs no secret.
- `kid` header selects the key. We keep current + previous keys valid during a
  rotation window so in-flight tokens don't break. Rotation is scheduled and
  automated.

## 8.2 Multi-device & session management

- Each device login creates a distinct session (with `deviceId`, UA, IP, geo).
- Users can list sessions and revoke any device (`DELETE /auth/sessions/{id}`) or all
  (`/auth/logout/all`).
- FCM tokens are bound per device for targeted push and are purged on logout.

## 8.3 OTP (phone/email)

- Codes are random, short-lived (5 min), **hashed** at rest, single-use.
- Strict rate limits: N sends per target per window + per-IP; exponential cooldown.
- Attempt cap per code (lock after 5 wrong tries).
- Delivered via the notification engine (SMS/email providers) with abuse monitoring
  (OTP is a common cost-abuse/enumeration vector).

## 8.4 OAuth (Google / Apple)

- Client obtains provider `id_token`; **backend verifies it** against the provider's
  JWKS (issuer, audience, expiry, signature). We never trust a client-asserted
  identity.
- On first login we link/create the user; subsequent logins match by
  `providerUserId`. Apple's private-relay email is handled and stored as-is.

## 8.5 Password storage

- **argon2id** (memory-hard) with per-user salt and tuned cost. Never MD5/SHA/bcrypt-
  without-reason. Password change revokes other sessions (configurable).

## 8.6 Account lockout & suspicious login detection

- **Lockout:** failed-login counter per account; after threshold, temporary lock with
  exponential backoff (`lockedUntil`). Prevents brute force. Counter also keyed per IP
  to catch distributed attempts.
- **Suspicious login signals** (emit `SuspiciousLoginDetected`, may step-up to MFA /
  email alert / block):
  - New device/geo far from usual (impossible-travel heuristic).
  - Login after many failures.
  - Refresh-token replay (family revocation, §8.1).
  - Velocity anomalies (many accounts one IP, many IPs one account).
- These signals are events feeding the fraud/analytics pipeline — the AI-ready
  substrate lets us later replace heuristics with a model without re-instrumenting.

## 8.7 Encryption

- **In transit:** TLS 1.2+ everywhere (Cloudflare → NGINX → app; app → DB/Redis over
  TLS; app → external APIs over TLS). No plaintext hops.
- **At rest:** MongoDB encrypted volumes; S3 SSE-KMS; Redis persistence encrypted.
- **Field-level encryption** for the most sensitive PII (government IDs, VIN,
  registration numbers, payout bank refs): encrypted with a KMS-derived data key
  before storage, decrypted only when needed. Even a DB dump does not leak these.
- **Hashing** for anything we only need to compare, never read back (refresh tokens,
  OTP codes) — sha256/argon2 as appropriate.

## 8.8 Secrets management

- **No secrets in code, env files, or the repo.** Production secrets live in AWS
  Secrets Manager / SSM Parameter Store; the `secrets.provider` fetches them at boot
  and caches in memory. Local dev uses a git-ignored `.env` seeded from `.env.example`
  (which contains only keys + docs, never values).
- Secrets are rotated on a schedule; the app re-reads on rotation signal.
- CI/CD injects secrets from the secret store, never from repo variables for
  sensitive values.

## 8.9 AWS IAM & S3 security

- **Least privilege IAM:** the app's role can only touch the specific buckets/prefixes
  and KMS keys it needs — no `s3:*`. Separate roles for API vs workers.
- **S3 buckets are private.** No public ACLs, Block Public Access on. All access is
  via **short-lived presigned URLs** (upload: PUT presign scoped to a key + content-
  type + size; download: time-boxed GET presign). Clients never get AWS credentials.
- **Upload flow is safe:** client asks API for a presigned PUT (API authorizes +
  records intent), uploads directly to S3, then the object triggers an AV/malware scan
  (event → worker); only `scanStatus: clean` documents are usable. This keeps large
  files off the API tier and quarantines malicious uploads.
- Bucket separation by sensitivity (public-ish vehicle images via CDN vs. private KYC
  docs) with distinct policies and, for sensitive docs, no CDN and mandatory KMS.

## 8.10 Injection & input attacks

- **NoSQL injection:** `mongoSanitize` strips `$`/`.` from inputs; repositories build
  queries from typed DTO fields, never by spreading raw request objects into a filter.
- **XSS:** input sanitization + output encoding; strict CSP; the API is JSON-only (no
  server-rendered HTML), shrinking the surface. Admin web escapes all rendered
  content.
- **Mass assignment:** Zod validation **strips unknown fields**; services map DTO →
  entity explicitly (no `Object.assign(entity, req.body)`).
- **CSRF:** the mobile app uses bearer tokens (not cookies) → not CSRF-susceptible.
  The admin web, if it uses cookies, gets SameSite=strict cookies + CSRF tokens +
  origin checks; the preferred posture is bearer tokens in memory for the admin SPA
  too.
- **CORS:** strict allowlist (doc 06).
- **Clickjacking:** frameguard/CSP `frame-ancestors`.

## 8.11 Rate limiting & abuse (layers)

- Cloudflare (network/DDoS, bot management) → NGINX (coarse) → app global limiter →
  per-route limiter (login/otp/payment tight) → business-level throttles (e.g. max
  active bookings, max listings per unverified host). Limits are Redis-backed and
  identity-aware.

## 8.12 Payments & webhook security

- Stripe webhooks: **raw-body signature verification** (doc 06 §1) with the endpoint
  secret; reject unsigned/replayed events (Stripe timestamp tolerance + event-id
  dedupe in Mongo). We treat Stripe as the source of truth for charge status and
  reconcile via webhooks, never trusting client-side "payment success."
- PCI scope minimized: card data never touches our servers — Stripe Elements/SDK
  tokenizes on-device; we store only Stripe references.

## 8.13 Auditability & compliance

- Every sensitive action → immutable `audit_logs` (actor, before/after, ip,
  correlationId). Append-only, archived to cold storage.
- PII handling supports **data-subject requests** (export/erase) via the documents/
  users modules; soft-delete + a retention/erasure job handle "right to be forgotten"
  while preserving legally-required financial records (ledger is retained per law).
- Principle: **least data, least access, full trace.**

## 8.14 Threat model summary

| Threat | Primary control | Backstop |
|---|---|---|
| Credential stuffing / brute force | lockout + rate limit + argon2 | suspicious-login alerts |
| Token theft (access) | short TTL + session revocation | anomaly detection |
| Token theft (refresh) | rotation + family revocation on replay | device/geo checks |
| DDoS | Cloudflare | NGINX + app limiter |
| NoSQL injection | sanitize + typed queries | code review + tests |
| XSS | CSP + encoding + JSON API | input sanitize |
| Malicious uploads | AV scan gate + private S3 | content-type/size presign limits |
| Payment fraud | Stripe Radar + 3DS + deposit holds | ledger reconciliation |
| Privilege escalation | permission checks + policies, fail-closed | audit + least-priv IAM |
| Data breach at rest | volume + field encryption + KMS | least-access IAM, no public S3 |
