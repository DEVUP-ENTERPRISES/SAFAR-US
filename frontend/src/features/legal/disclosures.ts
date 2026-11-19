// Built-in copy of disclosures version 1, shown only if the API is unreachable; the live text is edited in admin.
export const DISCLOSURES_VERSION = '1.0';
export const DISCLOSURES_EFFECTIVE = 'November 18, 2026';

export type DisclosureId =
  | 'general' | 'statistics' | 'forward-looking' | 'earnings' | 'calculations' | 'insurance'
  | 'airport' | 'pricing' | 'reviews' | 'investment' | 'third-party' | 'corrections';

export type Disclosure = { id: DisclosureId; title: string; note: string; body: string[] };

export const DISCLOSURES: Disclosure[] = [
  {
    id: 'general',
    title: 'General website disclaimer',
    note: 'Website content is general information, not a binding offer. Your written agreement governs any transaction.',
    body: [
      'The information on this website is provided for general informational purposes. CatoDrive Inc. makes reasonable efforts to maintain accurate and current website information; however, individual statements, statistics, estimates, descriptions, and other information may be subject to change, correction, or revision.',
      'Certain information may include historical results, preliminary data, estimates, illustrative examples, management assumptions, or forward-looking statements.',
      'Unless expressly stated otherwise, website content does not constitute a binding offer, guarantee, warranty, or contractual commitment.',
      'The terms of any rental, asset-management, asset-partner, or other transaction are governed by the applicable written agreement and transaction-specific disclosures.',
      'Nothing in this notice excludes or limits any right or remedy that cannot lawfully be excluded or limited under applicable law.',
      'Questions concerning published website information may be sent through our contact page by choosing “A question about information on our website”.',
    ],
  },
  {
    id: 'statistics',
    title: 'Company statistics and financial metrics',
    note: 'Company-reported figures from internal records, not audited. Each figure shows the date it was reported.',
    body: [
      'Company statistics are based on internal company records as of the reporting date displayed with each statistic.',
      'Unless otherwise specified: Revenue means gross booking revenue from rentals recorded in CatoDrive’s booking and accounting records for the period shown, before management fees, owner payouts and taxes. Managed vehicles means vehicles under an active CatoDrive management or Asset Partner agreement on the date shown, whether owned by CatoDrive or by an Asset Partner, including vehicles temporarily unavailable for maintenance. Completed trips means completed rental transactions recorded in the company’s booking system. Customer ratings refer to CatoDrive’s host profile on Turo and reflect information retrieved on the date shown. Pipeline and upcoming bookings represent prospective or scheduled transactions and are not necessarily completed, paid, or recognized revenue.',
      'Gross bookings, customer payments, recognized revenue, management fees, owner payouts, taxes, refunds, and other financial measures are not interchangeable.',
      'Figures may change because of corrections, cancellations, refunds, accounting adjustments, or changes in reporting methodology.',
      'Unless expressly identified as audited or independently verified, these figures are company-reported and have not necessarily been independently audited or certified.',
    ],
  },
  {
    id: 'forward-looking',
    title: 'Forward-looking statements',
    note: 'Forecasts, targets and scenarios are management estimates, not guarantees. Actual results may differ materially.',
    body: [
      'This website may contain forward-looking statements concerning anticipated revenue, future fleet size, market expansion, utilization, profitability, financing, technology development, customer demand, and business growth.',
      'These statements reflect management’s current expectations and assumptions as of the date indicated. They are not guarantees of future performance.',
      'Actual results may differ materially because of market conditions, competition, insurance costs, vehicle depreciation, maintenance, accidents, theft, regulatory requirements, financing availability, technology development, customer demand, and other operational or financial risks.',
      'Illustrative calculations, business targets, and financial projections are not promises of revenue, profit, investment returns, or business success.',
    ],
  },
  {
    id: 'earnings',
    title: 'Asset Partner earnings',
    note: 'Owner earnings are not guaranteed. Examples come from specific vehicles in 2025 and are not typical; results depend on the car, demand, costs and downtime.',
    body: [
      'All financial figures displayed in connection with the CatoDrive Asset Partner Program are estimates or historical examples unless expressly identified as actual results for a defined reporting period.',
      'Vehicle-owner earnings are not guaranteed.',
      'Actual results depend on vehicle type, condition, location, rental demand, pricing, availability, utilization, insurance costs, maintenance, cleaning, repairs, financing, depreciation, downtime, taxes, and other expenses.',
      'Illustrative owner proceeds should not be interpreted as net profit or guaranteed investment returns.',
      'Where financial examples are provided, CatoDrive will identify the assumptions used, including rental rates, estimated booked days, management fees, insurance expenses, cleaning expenses, and other material deductions.',
      'Past performance by one vehicle or owner is not necessarily representative of other participants.',
      'Prospective asset partners should review the applicable Asset Partner Agreement, fee schedule, insurance documents, and vehicle-specific financial assumptions before participating.',
    ],
  },
  {
    id: 'calculations',
    title: 'Financial calculations',
    note: 'Hypothetical illustration. It excludes financing, depreciation, taxes, registration, repairs, tires, deductibles and downtime.',
    body: [
      'Financial examples are hypothetical illustrations based on the assumptions identified with each example. They are not guarantees of actual revenue, owner payouts, profitability, or investment returns.',
      'Unless expressly stated, examples may exclude vehicle financing, interest, depreciation, taxes, registration, unexpected repairs, tire replacement, deductibles, downtime, and other ownership or operating expenses.',
      'Actual owner payments are determined by the applicable written agreement and the transactions, deductions, adjustments, and expenses applicable to the relevant vehicle.',
    ],
  },
  {
    id: 'insurance',
    title: 'Insurance',
    note: 'Coverage is subject to the policy’s terms, limits, deductibles and exclusions. The policy and your written agreement control.',
    body: [
      'Insurance coverage is subject to the terms, conditions, definitions, exclusions, limitations, deductibles, endorsements, and requirements of the applicable insurance policy or protection arrangement.',
      'References to liability coverage, collision protection, comprehensive coverage, physical damage protection, roadside assistance, or deductible limitations are general descriptions only.',
      'Coverage may vary according to the vehicle, driver, rental transaction, location, period of use, eligibility requirements, and applicable policy conditions.',
      'The actual insurance policy, declarations, endorsements, and applicable written agreements control the scope of coverage.',
      'Customers and asset partners should request and review the relevant insurance documentation before entering into a transaction.',
    ],
  },
  {
    id: 'airport',
    title: 'Airport delivery',
    note: 'Airport delivery follows each airport’s rules and permits. You get exact pickup and return instructions for your booking.',
    body: [
      'Airport delivery, pickup, return, terminal service, and parking arrangements are subject to applicable airport rules, permits, authorizations, security requirements, and location-specific procedures.',
      'A description of airport delivery or terminal service does not mean CatoDrive has unrestricted access to airport terminals, curbsides, parking areas, or other airport property.',
      'Customers will receive specific pickup and return instructions for their reservation. These instructions must be followed.',
      'CatoDrive will provide airport services only at locations and in a manner authorized by the applicable airport or other relevant authority.',
    ],
  },
  {
    id: 'pricing',
    title: 'Vehicle availability and pricing',
    note: 'Prices and availability can change until your booking is confirmed. All mandatory fees are shown before you pay.',
    body: [
      'Vehicle listings, photographs, descriptions, rental rates, and delivery options are subject to change. A vehicle is not guaranteed to be available until the reservation is confirmed.',
      'Displayed rental prices may vary according to dates, duration, location, demand, vehicle selection, and delivery requirements.',
      'Mandatory fees and other applicable charges will be disclosed during the booking process in accordance with applicable law.',
      'Reservations are subject to driver eligibility requirements, payment authorization, vehicle availability, and the applicable rental agreement.',
      'Cancellation, refund, deposit, mileage, late-return, cleaning, and damage charges are governed by the applicable rental agreement and checkout disclosures.',
    ],
  },
  {
    id: 'reviews',
    title: 'Testimonials and reviews',
    note: 'Reviews reflect individual experiences; yours may differ.',
    body: [
      'Customer reviews and testimonials reflect the opinions or experiences of the individuals who provided them. Individual experiences may differ.',
      'Where reviews are reproduced from third-party platforms, the source and, where reasonably available, the retrieval date will be identified.',
      'Any material relationship between CatoDrive and an individual providing an endorsement, including compensation, free services, discounts, employment, ownership, or other benefits, will be disclosed where required by law.',
      'Individual testimonials should not be interpreted as representative of every customer’s or asset partner’s experience unless reliable evidence supports that representation.',
    ],
  },
  {
    id: 'investment',
    title: 'Investment risk',
    note: 'Not an offer to sell securities. Investing in a private company is speculative, and you could lose your entire investment.',
    body: [
      'The information on this page is provided for preliminary informational and discussion purposes. It is not an offer to sell or a solicitation of an offer to buy any security, SAFE, equity interest, debt instrument, or other investment product.',
      'Any securities offering, if made, will be made only through definitive offering documents and in compliance with applicable federal and state securities laws.',
      'An investment in a private company is speculative and involves substantial risk, including the possible loss of the entire amount invested.',
      'A SAFE or other convertible instrument does not necessarily represent immediate ownership of a fixed percentage of the company’s outstanding shares. Conversion, dilution, investor rights, and economic outcomes are governed by the definitive executed documents.',
      'Valuations, financial projections, exit scenarios, revenue multiples, and potential returns are illustrative and are not guarantees of future company value or investor returns.',
      'Prospective investors should independently review the company’s financial statements, capitalization, liabilities, material contracts, regulatory compliance, business risks, and offering documents, and consult their own professional advisers.',
      'The company will accept investments only in accordance with the requirements of the applicable securities offering exemption and definitive transaction documents.',
    ],
  },
  {
    id: 'third-party',
    title: 'Third-party services',
    note: 'Some services are provided by independent companies under their own terms.',
    body: [
      'CatoDrive may use independent third-party providers for insurance, payment processing, identity verification, telematics, parking, technology, delivery, and other services.',
      'References to third-party businesses, products, or platforms do not necessarily imply sponsorship, endorsement, ownership, or control.',
      'Third-party services are subject to their own terms, policies, availability, and operational requirements.',
      'Nothing in this notice limits any contractual responsibility CatoDrive has expressly undertaken.',
    ],
  },
  {
    id: 'corrections',
    title: 'Corrections and updates',
    note: 'We correct published information when we find an error.',
    body: [
      'CatoDrive may correct, update, or remove website information when the company identifies an error, inconsistency, outdated figure, or change in reporting methodology.',
      'Where appropriate, material corrections will identify the affected information, reporting period, and nature of the correction.',
      'Questions concerning published website information may be sent through our contact page by choosing “A question about information on our website”.',
      'Nothing in this notice limits rights or remedies available under applicable law.',
    ],
  },
];

export const DISCLOSURE = Object.fromEntries(DISCLOSURES.map((d) => [d.id, d])) as Record<DisclosureId, Disclosure>;
