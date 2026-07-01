# TURA Backend

Node.js + Express + TypeScript **modular monolith** for the TURA Mobility OS.
Architecture blueprint lives in [`../docs/architecture`](../docs/architecture).

## Stack
- Express 4 + TypeScript (strict)
- MongoDB (Mongoose) — replica set required in prod (transactions)
- Redis (ioredis) — cache, sessions, rate limiting, later BullMQ queues
- JWT access + rotating refresh tokens, argon2id password hashing
- Zod validation, pino structured logging, helmet/cors/compression

## Getting started
```bash
cd backend
cp .env.example .env         # adjust if needed
npm install
# start MongoDB + Redis locally (or Docker), then:
npm run dev                  # http://localhost:4000
```

## Verify it's up
```bash
curl http://localhost:4000/api/v1/system/health
```

## Try the auth flow
```bash
# register
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"password123","firstName":"Ada"}'

# login → returns { tokens: { accessToken, refreshToken } }
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"password123"}'

# authenticated request
curl http://localhost:4000/api/v1/users/me \
  -H "Authorization: Bearer <accessToken>"
```

## Scripts
- `npm run dev` — hot-reload dev server
- `npm run build` — compile to `dist/`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run format`

## Structure
Vertical slices per domain module under `src/modules/*`
(`api` → `application` → `domain` → `infrastructure`). Shared plumbing in
`src/shared`, external adapters in `src/infrastructure`, validated config in
`src/config`. See the architecture docs for the full module catalog and the
service-extraction plan.

### Implemented so far
- Config (validated env), logging, Mongo + Redis connections
- Middleware pipeline: request-id, helmet, cors, compression, logging, rate limit,
  validation, auth (JWT + session), central error handler
- `auth` module: register, login, refresh (with rotation + replay detection), logout
- `users` module: `/me`
- `system`: health + readiness

Next modules follow the same slice pattern (vehicles, bookings, payments, …).
