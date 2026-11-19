// Seed content from the CatoDrive Website Legal Compliance & Disclaimer Package v1.0; after seeding it is edited in admin.

export const CLAIM_CATEGORIES = ['revenue', 'projection', 'fleet', 'trips', 'daily_rate', 'utilization', 'owner_earnings', 'reviews', 'insurance', 'airport', 'investor_rights', 'exit'] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CLAIM_OWNERS = ['Finance', 'Operations', 'Marketing', 'Legal', 'Management'] as const;
export type ClaimOwner = (typeof CLAIM_OWNERS)[number];

export type ClaimKind = 'reported' | 'forecast' | 'example' | 'text';

// Minimum review frequency per category, in days (package section 24).
export const REVIEW_DAYS: Record<ClaimCategory, number> = {
  revenue: 30, projection: 30, fleet: 30, trips: 30, daily_rate: 30, utilization: 30,
  owner_earnings: 90, reviews: 90, exit: 90, investor_rights: 90,
  insurance: 365, airport: 365,
};

// High-risk claims need a recorded legal review before approval (package sections 4 and 23).
export const NEEDS_LEGAL: ReadonlySet<ClaimCategory> = new Set(['revenue', 'owner_earnings', 'insurance', 'airport', 'investor_rights', 'projection', 'exit']);

// What evidence each category needs (package section 20).
export const EVIDENCE_HINT: Record<ClaimCategory, string> = {
  revenue: 'General ledger, bank records, processor statements, accounting reports.',
  projection: 'Approved financial model and underlying assumptions.',
  fleet: 'VIN-level register, title/ownership records, management agreements.',
  trips: 'Booking records, trip completion reports, cancellation records.',
  daily_rate: 'Completed booking data and calculation worksheet.',
  utilization: 'Available vehicle-days and booked vehicle-days.',
  owner_earnings: 'Individual owner statements and expense reconciliations.',
  reviews: 'Platform source, date, review count, rating evidence.',
  insurance: 'Policy declarations, endorsements, certificates, written agreements.',
  airport: 'Permits, written authorizations, fee schedules.',
  investor_rights: 'Executed SAFE, corporate documents, offering documents.',
  exit: 'Valuation assumptions and documented scenario analysis.',
};

export interface ClaimSeed {
  key: string;
  category: ClaimCategory;
  owner: ClaimOwner;
  kind: ClaimKind;
  label: string;
  display: string;
  value?: number;
  asOf?: string;
  wording: string;
  definition: string;
  pages: string[];
}

export const CLAIM_SEEDS: ClaimSeed[] = [
  { key: 'revenue2026', category: 'revenue', owner: 'Finance', kind: 'reported', label: '2026 revenue to date', display: '$900,627', value: 900_627, asOf: '2026-11-18', wording: '$900,627 earned in 2026', definition: 'Gross booking revenue from rentals recorded in booking and accounting records for 2026 to date, before management fees, owner payouts and taxes.', pages: ['/', '/about', '/asset-partners', '/investors'] },
  { key: 'revenue2025', category: 'revenue', owner: 'Finance', kind: 'reported', label: '2025 revenue', display: '$307K', value: 307_000, asOf: '2025-12-31', wording: '$307K (2025)', definition: 'Gross booking revenue for calendar 2025.', pages: ['/asset-partners', '/investors'] },
  { key: 'revenue2023', category: 'revenue', owner: 'Finance', kind: 'reported', label: '2023 revenue', display: '$1,574', value: 1_574, asOf: '2023-12-31', wording: '$1,574 (2023)', definition: 'Gross booking revenue for calendar 2023.', pages: ['/asset-partners', '/investors'] },
  { key: 'target2026', category: 'projection', owner: 'Management', kind: 'forecast', label: '2026 full-year forecast', display: '$1.2M', value: 1_200_000, asOf: '2026-11-18', wording: '$1.2M full-year forecast', definition: 'Management forecast of 2026 gross booking revenue; not earned revenue.', pages: ['/investors'] },
  { key: 'pipeline', category: 'revenue', owner: 'Operations', kind: 'reported', label: 'Upcoming bookings', display: '$78,734', value: 78_734, asOf: '2026-11-18', wording: '$78,734 upcoming bookings', definition: 'Booking value of scheduled trips not yet completed; not recognized revenue.', pages: ['/investors'] },
  { key: 'goal700', category: 'projection', owner: 'Management', kind: 'forecast', label: '700-vehicle revenue goal', display: '$10.08M', value: 10_080_000, asOf: '2026-11-18', wording: '$10.08M goal: 700 × $1,200/mo × 12', definition: 'Arithmetic goal for a 700-vehicle fleet; not a forecast.', pages: ['/investors'] },
  { key: 'fleet', category: 'fleet', owner: 'Operations', kind: 'reported', label: 'Vehicles managed', display: '100+', value: 100, asOf: '2026-09-30', wording: '100+ vehicles managed', definition: 'Vehicles under an active management or Asset Partner agreement on the date shown, including vehicles temporarily unavailable.', pages: ['/', '/about', '/asset-partners', '/investors'] },
  { key: 'fleet2025', category: 'fleet', owner: 'Operations', kind: 'reported', label: 'Vehicles managed in 2025', display: '72', value: 72, asOf: '2025-12-31', wording: '72 vehicles (2025)', definition: 'Vehicles under management at the end of 2025.', pages: ['/investors'] },
  { key: 'trips', category: 'trips', owner: 'Operations', kind: 'reported', label: 'Completed trips', display: '5,100+', value: 5_100, asOf: '2026-09-30', wording: '5,100+ completed trips', definition: 'Completed rental transactions recorded in the booking system.', pages: ['/', '/about', '/asset-partners', '/investors'] },
  { key: 'rating', category: 'reviews', owner: 'Marketing', kind: 'reported', label: 'Turo rating, 2,053 reviews, All-Star Host', display: '4.96★', value: 4.96, asOf: '2026-09-12', wording: '4.96★, 2,053 reviews on Turo, All-Star Host', definition: 'Average rating on CatoDrive’s Turo host profile on the date retrieved.', pages: ['/', '/about', '/asset-partners', '/investors'] },
  { key: 'dailyRate', category: 'daily_rate', owner: 'Finance', kind: 'example', label: 'Daily rate range, 2025 fleet bookings', display: '$65–$120', asOf: '2025-12-31', wording: '$65–$120 a day', definition: 'Range of average daily rates across 2025 completed bookings.', pages: ['/asset-partners'] },
  { key: 'bookedDays', category: 'utilization', owner: 'Operations', kind: 'example', label: 'Booked days a month (70–80%) in the examples', display: '21–24', asOf: '2025-12-31', wording: '21–24 booked days a month (70–80%)', definition: 'Booked vehicle-days divided by available vehicle-days for the example cars.', pages: ['/asset-partners'] },
  { key: 'ownerConservative', category: 'owner_earnings', owner: 'Finance', kind: 'example', label: 'Conservative example (Kia Sportage, Buick Envista), monthly gross in cents', display: '$1,029 net', value: 152_000, asOf: '2025-12-31', wording: '~$1,029/mo net', definition: 'Monthly gross bookings for the example car; net is gross less the 20% fee, $137 insurance and $50 detailing.', pages: ['/', '/about', '/asset-partners'] },
  { key: 'ownerMid', category: 'owner_earnings', owner: 'Finance', kind: 'example', label: 'Mid-range example (VW Tiguan, Jeep Grand Cherokee), monthly gross in cents', display: '$1,400 net', value: 198_375, asOf: '2025-12-31', wording: '~$1,400/mo net', definition: 'Monthly gross bookings for the example car; net is gross less the 20% fee, $137 insurance and $50 detailing.', pages: ['/asset-partners'] },
  { key: 'ownerTop', category: 'owner_earnings', owner: 'Finance', kind: 'example', label: 'Top performer example (VW Atlas, Nissan Pathfinder), monthly gross in cents', display: '$1,841 net', value: 253_500, asOf: '2025-12-31', wording: '~$1,841/mo net', definition: 'Monthly gross bookings for the example car; net is gross less the 20% fee, $137 insurance and $50 detailing.', pages: ['/', '/about', '/asset-partners'] },
  { key: 'insuranceLiability', category: 'insurance', owner: 'Legal', kind: 'text', label: '$750K liability per trip; Roamly off-trip cover', display: '$750K', wording: '$750K liability and collision coverage per trip; Roamly commercial fleet insurance during non-trip custody', definition: 'Limits and insured parties per the policy declarations.', pages: ['/about', '/asset-partners'] },
  { key: 'deductibleCap', category: 'insurance', owner: 'Legal', kind: 'text', label: '$1,000 owner damage cap (Addendum No. 1)', display: '$1,000', wording: 'Owner’s share of damage capped at $1,000 per incident', definition: 'Per the executed Asset Partner Agreement, Addendum No. 1.', pages: ['/about', '/asset-partners'] },
  { key: 'airportDelivery', category: 'airport', owner: 'Operations', kind: 'text', label: 'Delivery at DFW and Love Field', display: 'DFW, DAL', wording: 'Delivered at DFW International and Love Field where airport rules allow', definition: 'Only at locations and in the manner each airport authorizes.', pages: ['/', '/about', '/asset-partners', '/vehicles/[id]'] },
  { key: 'offeringTerms', category: 'investor_rights', owner: 'Legal', kind: 'text', label: 'SAFE round terms and investor rights', display: '$504,000 SAFE', wording: '$504,000 SAFE, $16.8M pre-money, $21,000 minimum, pro-rata, MFN, anti-dilution, board observer at $100K+', definition: 'Per the executed SAFE and offering documents.', pages: ['/investors'] },
  { key: 'exitScenarios', category: 'exit', owner: 'Finance', kind: 'text', label: 'Hypothetical exit scenarios', display: '$64M–$120M', wording: 'Base, strong and bull exit scenarios at 8–10× revenue', definition: 'Assumes the full round buys 3% with no dilution and a sale at the revenue and multiple shown.', pages: ['/investors'] },
];

export interface DisclosureSection { id: string; title: string; note: string; body: string[] }

const ASK = 'Questions concerning published website information may be sent through our contact page by choosing “A question about information on our website”.';

export const DISCLOSURE_SEED: DisclosureSection[] = [
  { id: 'general', title: 'General website disclaimer', note: 'Website content is general information, not a binding offer. Your written agreement governs any transaction.', body: [
    'The information on this website is provided for general informational purposes. CatoDrive Inc. makes reasonable efforts to maintain accurate and current website information; however, individual statements, statistics, estimates, descriptions, and other information may be subject to change, correction, or revision.',
    'Certain information may include historical results, preliminary data, estimates, illustrative examples, management assumptions, or forward-looking statements.',
    'Unless expressly stated otherwise, website content does not constitute a binding offer, guarantee, warranty, or contractual commitment.',
    'The terms of any rental, asset-management, asset-partner, or other transaction are governed by the applicable written agreement and transaction-specific disclosures.',
    'Nothing in this notice excludes or limits any right or remedy that cannot lawfully be excluded or limited under applicable law.',
    ASK,
  ] },
  { id: 'statistics', title: 'Company statistics and financial metrics', note: 'Company-reported figures from internal records, not audited. Each figure shows the date it was reported.', body: [
    'Company statistics are based on internal company records as of the reporting date displayed with each statistic.',
    'Unless otherwise specified: Revenue means gross booking revenue from rentals recorded in CatoDrive’s booking and accounting records for the period shown, before management fees, owner payouts and taxes. Managed vehicles means vehicles under an active CatoDrive management or Asset Partner agreement on the date shown, whether owned by CatoDrive or by an Asset Partner, including vehicles temporarily unavailable for maintenance. Completed trips means completed rental transactions recorded in the company’s booking system. Customer ratings refer to CatoDrive’s host profile on Turo and reflect information retrieved on the date shown. Pipeline and upcoming bookings represent prospective or scheduled transactions and are not necessarily completed, paid, or recognized revenue.',
    'Gross bookings, customer payments, recognized revenue, management fees, owner payouts, taxes, refunds, and other financial measures are not interchangeable.',
    'Figures may change because of corrections, cancellations, refunds, accounting adjustments, or changes in reporting methodology.',
    'Unless expressly identified as audited or independently verified, these figures are company-reported and have not necessarily been independently audited or certified.',
  ] },
  { id: 'forward-looking', title: 'Forward-looking statements', note: 'Forecasts, targets and scenarios are management estimates, not guarantees. Actual results may differ materially.', body: [
    'This website may contain forward-looking statements concerning anticipated revenue, future fleet size, market expansion, utilization, profitability, financing, technology development, customer demand, and business growth.',
    'These statements reflect management’s current expectations and assumptions as of the date indicated. They are not guarantees of future performance.',
    'Actual results may differ materially because of market conditions, competition, insurance costs, vehicle depreciation, maintenance, accidents, theft, regulatory requirements, financing availability, technology development, customer demand, and other operational or financial risks.',
    'Illustrative calculations, business targets, and financial projections are not promises of revenue, profit, investment returns, or business success.',
  ] },
  { id: 'earnings', title: 'Asset Partner earnings', note: 'Owner earnings are not guaranteed. Examples come from specific vehicles in 2025 and are not typical; results depend on the car, demand, costs and downtime.', body: [
    'All financial figures displayed in connection with the CatoDrive Asset Partner Program are estimates or historical examples unless expressly identified as actual results for a defined reporting period.',
    'Vehicle-owner earnings are not guaranteed.',
    'Actual results depend on vehicle type, condition, location, rental demand, pricing, availability, utilization, insurance costs, maintenance, cleaning, repairs, financing, depreciation, downtime, taxes, and other expenses.',
    'Illustrative owner proceeds should not be interpreted as net profit or guaranteed investment returns.',
    'Where financial examples are provided, CatoDrive will identify the assumptions used, including rental rates, estimated booked days, management fees, insurance expenses, cleaning expenses, and other material deductions.',
    'Past performance by one vehicle or owner is not necessarily representative of other participants.',
    'Prospective asset partners should review the applicable Asset Partner Agreement, fee schedule, insurance documents, and vehicle-specific financial assumptions before participating.',
  ] },
  { id: 'calculations', title: 'Financial calculations', note: 'Hypothetical illustration. It excludes financing, depreciation, taxes, registration, repairs, tires, deductibles and downtime.', body: [
    'Financial examples are hypothetical illustrations based on the assumptions identified with each example. They are not guarantees of actual revenue, owner payouts, profitability, or investment returns.',
    'Unless expressly stated, examples may exclude vehicle financing, interest, depreciation, taxes, registration, unexpected repairs, tire replacement, deductibles, downtime, and other ownership or operating expenses.',
    'Actual owner payments are determined by the applicable written agreement and the transactions, deductions, adjustments, and expenses applicable to the relevant vehicle.',
  ] },
  { id: 'insurance', title: 'Insurance', note: 'Coverage is subject to the policy’s terms, limits, deductibles and exclusions. The policy and your written agreement control.', body: [
    'Insurance coverage is subject to the terms, conditions, definitions, exclusions, limitations, deductibles, endorsements, and requirements of the applicable insurance policy or protection arrangement.',
    'References to liability coverage, collision protection, comprehensive coverage, physical damage protection, roadside assistance, or deductible limitations are general descriptions only.',
    'Coverage may vary according to the vehicle, driver, rental transaction, location, period of use, eligibility requirements, and applicable policy conditions.',
    'The actual insurance policy, declarations, endorsements, and applicable written agreements control the scope of coverage.',
    'Customers and asset partners should request and review the relevant insurance documentation before entering into a transaction.',
  ] },
  { id: 'airport', title: 'Airport delivery', note: 'Airport delivery follows each airport’s rules and permits. You get exact pickup and return instructions for your booking.', body: [
    'Airport delivery, pickup, return, terminal service, and parking arrangements are subject to applicable airport rules, permits, authorizations, security requirements, and location-specific procedures.',
    'A description of airport delivery or terminal service does not mean CatoDrive has unrestricted access to airport terminals, curbsides, parking areas, or other airport property.',
    'Customers will receive specific pickup and return instructions for their reservation. These instructions must be followed.',
    'CatoDrive will provide airport services only at locations and in a manner authorized by the applicable airport or other relevant authority.',
  ] },
  { id: 'pricing', title: 'Vehicle availability and pricing', note: 'Prices and availability can change until your booking is confirmed. All mandatory fees are shown before you pay.', body: [
    'Vehicle listings, photographs, descriptions, rental rates, and delivery options are subject to change. A vehicle is not guaranteed to be available until the reservation is confirmed.',
    'Displayed rental prices may vary according to dates, duration, location, demand, vehicle selection, and delivery requirements.',
    'Mandatory fees and other applicable charges will be disclosed during the booking process in accordance with applicable law.',
    'Reservations are subject to driver eligibility requirements, payment authorization, vehicle availability, and the applicable rental agreement.',
    'Cancellation, refund, deposit, mileage, late-return, cleaning, and damage charges are governed by the applicable rental agreement and checkout disclosures.',
  ] },
  { id: 'reviews', title: 'Testimonials and reviews', note: 'Reviews reflect individual experiences; yours may differ.', body: [
    'Customer reviews and testimonials reflect the opinions or experiences of the individuals who provided them. Individual experiences may differ.',
    'Where reviews are reproduced from third-party platforms, the source and, where reasonably available, the retrieval date will be identified.',
    'Any material relationship between CatoDrive and an individual providing an endorsement, including compensation, free services, discounts, employment, ownership, or other benefits, will be disclosed where required by law.',
    'Individual testimonials should not be interpreted as representative of every customer’s or asset partner’s experience unless reliable evidence supports that representation.',
  ] },
  { id: 'investment', title: 'Investment risk', note: 'Not an offer to sell securities. Investing in a private company is speculative, and you could lose your entire investment.', body: [
    'The information on this page is provided for preliminary informational and discussion purposes. It is not an offer to sell or a solicitation of an offer to buy any security, SAFE, equity interest, debt instrument, or other investment product.',
    'Any securities offering, if made, will be made only through definitive offering documents and in compliance with applicable federal and state securities laws.',
    'An investment in a private company is speculative and involves substantial risk, including the possible loss of the entire amount invested.',
    'A SAFE or other convertible instrument does not necessarily represent immediate ownership of a fixed percentage of the company’s outstanding shares. Conversion, dilution, investor rights, and economic outcomes are governed by the definitive executed documents.',
    'Valuations, financial projections, exit scenarios, revenue multiples, and potential returns are illustrative and are not guarantees of future company value or investor returns.',
    'Prospective investors should independently review the company’s financial statements, capitalization, liabilities, material contracts, regulatory compliance, business risks, and offering documents, and consult their own professional advisers.',
    'The company will accept investments only in accordance with the requirements of the applicable securities offering exemption and definitive transaction documents.',
  ] },
  { id: 'third-party', title: 'Third-party services', note: 'Some services are provided by independent companies under their own terms.', body: [
    'CatoDrive may use independent third-party providers for insurance, payment processing, identity verification, telematics, parking, technology, delivery, and other services.',
    'References to third-party businesses, products, or platforms do not necessarily imply sponsorship, endorsement, ownership, or control.',
    'Third-party services are subject to their own terms, policies, availability, and operational requirements.',
    'Nothing in this notice limits any contractual responsibility CatoDrive has expressly undertaken.',
  ] },
  { id: 'corrections', title: 'Corrections and updates', note: 'We correct published information when we find an error.', body: [
    'CatoDrive may correct, update, or remove website information when the company identifies an error, inconsistency, outdated figure, or change in reporting methodology.',
    'Where appropriate, material corrections will identify the affected information, reporting period, and nature of the correction.',
    ASK,
    'Nothing in this notice limits rights or remedies available under applicable law.',
  ] },
];

export const DISCLOSURE_IDS = DISCLOSURE_SEED.map((d) => d.id);
