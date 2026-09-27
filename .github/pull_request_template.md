## What this changes
<!-- One or two sentences: what a user or admin will see differently. -->

## Why
<!-- The problem it solves. Link the issue or screenshot if there is one. -->

## How it was tested
- [ ] Backend: `npm run lint && npm run typecheck && npx jest --runInBand` (in `backend/`)
- [ ] Website: `npx tsc --noEmit && npm run build` (in `frontend/`)
- [ ] Admin: `npx tsc --noEmit` (in `admin-web/`)
- [ ] Tried it in the browser on a phone-sized screen

## Review checklist (the reviewer ticks these)
- [ ] Target branch is `main-checkpoint-01`, never `main` directly
- [ ] Reuses existing components, services and hooks; nothing duplicated
- [ ] No hardcoded prices, fees, hours or limits: they come from platform config (admin editable)
- [ ] Every new API route checks sign-in, ownership and input (zod), and has a rate limit where it touches money, codes or uploads
- [ ] No secrets, keys, real emails or admin paths in code, comments or examples
- [ ] Errors shown to people are plain sentences; nothing technical reaches the screen
- [ ] No external service can block the flow: there is a fallback
- [ ] No `console.log`, commented-out code, TODOs or mock data left behind
- [ ] Kept small: if a change is over ~300 lines, it is split into smaller pull requests
