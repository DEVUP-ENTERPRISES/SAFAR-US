# Website claims register

**The live register is in the admin console: Control → Website Claims.** It holds every claim below with its evidence, owner, status, review date and full history, and only approved figures reach the website (`GET /api/v1/website/claims`). A suspended figure disappears from the site automatically; text claims (insurance, airport, offering) email the team to remove the wording. `frontend/src/features/legal/claims.ts` is only the fallback the site uses if the API is unreachable.

Workflow (package Part VI): edit → add evidence → **Verify** (Finance/Ops, `website:claims`) → **Record legal review** for high-risk claims (admin, `platform:manage`) → **Approve** (admin) → monitored. Reviews fall due on the section 24 schedule (monthly for revenue, fleet, trips, rates; quarterly for owner examples, ratings, offering, exits; yearly for insurance and airport) and a daily job emails one digest of overdue claims, repeating weekly until handled.

Disclosures (sections 6–17) are edited in **Control → Website Disclosures**; each publish is a new version and every version stays readable at `/legal/disclosures?version=N`.

The table below is the initial register as seeded on Nov 18, 2026.

| ID | Published wording | Pages | As of | Supporting record (PDF Part V) | Owner | Status |
|---|---|---|---|---|---|---|
| revenue2026 | $900,627 2026 revenue to date | Home, About, Asset Partners, Investors | 2026-11-18 | General ledger, bank and Stripe statements; confirm "gross booking revenue" definition | Finance | Needs evidence |
| revenue2025 / 2023 | $307K (2025), $1,574 (2023) | Asset Partners, Investors | year end | Year-end accounting reports | Finance | Needs evidence |
| target2026 | $1.2M 2026 full-year forecast | Investors | 2026-11-18 | Approved financial model | Finance / CEO | Needs evidence |
| pipeline | $78,734 upcoming bookings | Investors | 2026-11-18 | Booking export of scheduled trips | Operations | Needs evidence |
| goal700 | $10.08M 700-vehicle goal | Investors | 2026-11-18 | Financial model (labelled a goal, not a forecast) | Finance / CEO | Needs evidence |
| fleet | 100+ vehicles managed | Home, About, Asset Partners, Investors | 2026-09-30 | VIN-level register and signed management agreements | Operations | Needs evidence |
| fleet2025 | 72 vehicles (2025) | Investors | 2025-12-31 | VIN-level register | Operations | Needs evidence |
| trips | 5,100+ completed trips | Home, About, Asset Partners, Investors | 2026-09-30 | Booking and trip-completion reports (replaces the older 3,626) | Operations | Needs evidence |
| rating | 4.96★, 2,053 reviews on Turo, All-Star Host | Home, About, Asset Partners, Investors | 2026-09-12 | Dated screenshot of the Turo host profile | Marketing | Needs evidence |
| owner examples | $1,029 / $1,400 / $1,841 net a month (2025) | Home, About, Asset Partners | 2025 | Owner statements for the named models; gross $1,520 / $1,983.75 / $2,535 less 20% fee, $137 insurance, $50 detailing | Finance | Needs evidence |
| dailyRate / bookedDays | $65–$120 a day, 21–24 booked days (70–80%) | Asset Partners | 2025 | Completed-booking export and vehicle-day calculation | Finance / Operations | Needs evidence |
| insurance | $750K liability per trip; Roamly off-trip cover | About, Asset Partners | — | Policy declarations and endorsements | Legal / broker | Needs evidence |
| deductible cap | $1,000 per incident (Addendum No. 1) | About, Asset Partners | — | Executed partner agreement, Addendum No. 1 | Legal | Needs evidence |
| airport | Delivery at DFW and Love Field "where airport rules allow" | Home, About, Asset Partners, checkout | — | Written DFW and Love Field authorizations | Operations / Legal | Needs evidence |
| offering | $504,000 SAFE, $16.8M pre-money, $21,000 minimum, investor rights | Investors | — | Executed SAFE, corporate and offering documents; securities counsel sign-off | Legal | Needs evidence |
| exits | $64M–$120M hypothetical exit scenarios | Investors | — | Scenario analysis (assumptions shown on the page) | Finance | Needs evidence |

## What changed on the site (Nov 18, 2026)

- Conflicting figures unified: trips 5,100+ (was 3,626 on Investors), owner net $1,029–$1,841 (was $1,066–$1,878 on About), revenue $900,627 (was $766,143+ on Home and Asset Partners), rating 4.96★ (was 4.9★).
- The owner economics table now adds up: each example's net is worked out from its gross in code. The old table listed gross $1,365–$2,028, which did not produce the $1,029–$1,841 it showed.
- "Verified" removed wherever no audit backs it; figures now read "Company-reported, unaudited, as of [date]".
- The climbing "Live pace" revenue counter on Investors was removed. It extrapolated $900,627 forward and looked like live revenue. A static, dated figure replaces it.
- $1.2M labelled a management forecast; $10.08M a goal; exit scenarios labelled hypothetical with their assumptions; pipeline marked "not yet completed or earned".
- Absolute wording removed: "Guaranteed", "exposure is zero", "covers you completely", "cashing the check", "car pays for itself in 36–40 months", "5–15% below market rate".
- Airport wording changed from "curbside at the terminal" to "delivered at the airport where airport rules allow".
- Disclaimers placed beside the claims they qualify (sections 7–14) and in full on `/legal/disclosures` (sections 6–17), linked from the footer and the Legal page. The Investors page shows sections 7, 8 and 15 in full.

## Review schedule (PDF section 24)

Revenue, fleet and trips: monthly. Owner examples, ratings: quarterly. Insurance: on policy change and yearly. Airport: on change. Offering terms: before each offering.
