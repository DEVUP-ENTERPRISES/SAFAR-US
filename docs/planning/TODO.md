# To-do

Open actions, newest first. Tick them off (`[x]`) when done; move finished features to the changelog in the commit history.

## Waiting on us

- [ ] Board meeting: decide on Rewards and Refer a friend (see [PENDING-FEATURES.md](PENDING-FEATURES.md)), then switch them on in Admin → Economics.
- [ ] Submit the Wheelbase API access request, then answer their security questionnaire.
- [ ] When the Wheelbase key arrives: store it in AWS Secrets Manager, enable GitHub secret scanning, and connect bookings to Wheelbase.
- [ ] Decide the insurance route for waiting bookings: Wheelbase plans now, Bonzah as an option, plus a platform liability quote from a broker.
- [ ] Link every car to its Wheelbase listing (cars that aren't linked can't be booked while "only insurance-approved cars" is on).
- [ ] Set the extra-mile fee: $0.38 per mile for standard cars, $0.75 for premium models.
- [ ] Raise the card-attempt limit in Admin to about 50.
- [ ] Send NTTA the request for an official toll data feed.

## Deploy checklist (after each backend change)

- [ ] `git pull`, `npm ci`, `npm run build`, `pm2 restart tura-api` on the API server.
- [ ] Fonts for document stamps installed once: `sudo apt-get install -y fonts-dejavu-core fontconfig`.
- [ ] Stripe ID-photo read key (restricted, IP-allowlisted) set on the server.
- [ ] Server Node version is 20.9 or newer (`node -v`), needed by the image library since 2026-10-09.
- [ ] Once, after the 2026-10-10 deploy: move upcoming trips to the car's local calendar days. Preview first with `npx ts-node --transpile-only scripts/rekey-availability-local-days.ts --dry`, then run it without `--dry`. Safe to run twice.

## Reviews

- [ ] `authenticated_pages_ui` (UI redesign of signed-in pages): fix the missing `CardContent` import on the Membership page, update from main, push to `main-checkpoint-01`, then merge.
