/** Default legal text, published once and edited afterwards in the admin Help Centre (KB). Bracketed items are business facts to fill in there. */
export const LEGAL_ARTICLES = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    summary: 'What CatoDrive collects, why, who receives it, and the choices you have.',
    body: `_Last updated: [DATE]_

This policy explains how **[LEGAL ENTITY NAME]** ("CatoDrive", "we", "us") handles personal information when you use our website, web app and related services in the United States. CatoDrive is a marketplace: hosts list vehicles and guests book them.

## Information we collect

**You give us**
- Account details: name, email, phone number, password (stored only as a salted hash), profile photo, date of birth.
- Identity and driver verification: driver's licence details and images, and a selfie, collected through Stripe Identity or, if that is unavailable, through our camera-only manual review.
- For hosts: vehicle details (make, model, VIN, registration, odometer, photos, listing and pickup information), insurance and ownership documents, and payout details.
- Bookings, messages between hosts and guests, reviews, support requests, damage reports and evidence you upload.
- Payment information. Card details are entered directly into Stripe; we receive the brand, last four digits, expiry and a token, never the full card number.

**Collected automatically**
- Device and log information: IP address, browser and device type, pages viewed, referrer, and security and audit logs.
- Location: with your permission, your device's precise location for stamped condition photos and live trip tracking. Approximate location (city level) is derived from your IP address for analytics.
- Push-notification tokens if you turn notifications on.

**From others**
- Stripe returns the outcome of your identity check (verified or not, and the verified name and date of birth), payment status and payout status.
- If you sign in with Google, Apple or Facebook, we receive your name, email and profile picture from that provider.
- Vehicle history reports for listed vehicles, obtained by VIN from a vehicle-data provider.

## How we use it
To create and secure accounts; verify identity and driver eligibility; process bookings, deposits, refunds, charges and host payouts; run handover, trip and return workflows; send booking, safety and security messages; detect fraud and abuse; review damage claims and resolve disputes; provide support; improve the service; and meet legal obligations. We may use automated checks (for example fraud signals and AI-assisted comparison of check-in and return photos) to help our staff, and a person reviews outcomes that materially affect you.

## Who receives it
- **Hosts and guests** see what is needed for a trip: name, profile photo, verification status, reviews, messages, booking details and the pickup address once a booking is confirmed. Hosts do not receive your licence images or payment details.
- **Service providers** that act on our behalf: Stripe (payments, identity verification, payouts), Amazon Web Services (file storage), Firebase / Google (push notifications and Google sign-in), Google Maps and Mapbox (maps and address search), email and SMS delivery providers, an AI model provider (photos and text of a claim may be sent to compare trip condition and summarise evidence), a vehicle-history data provider, and error-monitoring tools.
- **Legal and safety**: when required by law, to respond to valid legal process, to protect people and property, and to enforce our terms.
- **Business transfers**: in a merger, sale or financing, subject to this policy.

We do not sell your personal information, and we do not share it for cross-context behavioural advertising. We do not use third-party advertising trackers.

## Identity verification and biometrics
Identity checks are run by Stripe Identity, which compares your licence with a selfie. Stripe processes and stores that verification data under its own terms; CatoDrive receives the result and the verified name and date of birth. If we use our manual review instead, we store the licence and selfie images you capture so our staff can review them. You will see a notice before any capture. We do not build our own face-recognition templates.

## Location
Precise location is used only when you allow it: to stamp inspection photos with where they were taken, and to show trip status. During a trip, hosts see the trip's status and, shortly before the return, the location needed to meet you; they do not see your location at other times. You can refuse location permission in your device settings, but some steps (such as stamped inspection photos) may then not be completable.

## Cookies and analytics
We use essential storage (sign-in session, preferences, booking drafts) and our own first-party analytics. Analytics resolves your IP address to a city, then keeps only a salted, non-reversible visitor hash, not the IP address, and page-view records are deleted after 90 days.

## How long we keep it
We keep information only as long as needed for the purposes above and to meet legal, tax, accounting, fraud-prevention, claims and dispute needs. Payment and booking records are kept for financial and legal reasons. Page-view analytics are deleted after 90 days. Other retention periods: [RETENTION SCHEDULE TO BE CONFIRMED WITH COUNSEL].

## Security
We use encryption in transit, access controls, hashed passwords, rate limiting, audit logs and short-lived, access-controlled file links. No system is perfectly secure, and we cannot guarantee absolute security.

## Your choices and rights
You can view and update your profile in Account settings, turn notifications on or off, and download a copy of your data or delete your account from Account settings. Deleting removes your identifiers and identity documents; we keep de-identified financial, safety and claim records where we are required or permitted to, and cannot delete while a claim, dispute or legal hold is open.

Depending on where you live (for example California, Colorado, Connecticut, Texas, Virginia and other states with privacy laws), you may have the right to know, access, correct, delete and obtain a copy of your personal information, to opt out of sale, targeted advertising and profiling, and to appeal a decision on your request. We do not sell or share personal information for advertising. To make a request, use Account settings or email **[PRIVACY EMAIL]**. We may need to verify your identity, and we respond within the time your state's law requires (generally 45 days). We do not discriminate against you for exercising your rights. You may use an authorised agent, or appeal a refusal by replying to our decision.

## Children
CatoDrive is for adults aged 21 or older [CONFIRM MINIMUM AGE]. We do not knowingly collect information from children under 13 (or under 16 for sale or sharing), and delete it if we learn we have.

## Changes
We will post updates on this page and change the date above; for material changes we will notify you.

## Contact
**[LEGAL ENTITY NAME]**, [POSTAL ADDRESS] · **[PRIVACY EMAIL]**
`,
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    summary: 'The rules that apply when you book or host on CatoDrive.',
    body: `_Last updated: [DATE]_

These terms are an agreement between you and **[LEGAL ENTITY NAME]** ("CatoDrive"). By creating an account or using CatoDrive you agree to them and to our Privacy Policy.

## Our role
CatoDrive is a marketplace platform. Hosts (owners of vehicles, including fleets and partners) offer vehicles; guests rent them. Unless a listing says the vehicle is operated by CatoDrive, the rental is between the host and the guest, and CatoDrive is not the owner, lessor or insurer of the vehicle.

## Accounts and eligibility
You must be at least [MINIMUM AGE] and able to form a binding contract, provide accurate information and keep your credentials secure. Guests must hold a valid driver's licence and pass identity verification; we may require re-verification at any time. We may refuse, suspend or close accounts to protect safety, comply with law or prevent fraud.

## Hosts
Hosts must own or be authorised to list each vehicle, keep it safe, registered, insured as required and free of open safety recalls, describe it accurately, keep photos and odometer information current, and hand it over as booked. A host must complete the handover inspection before the trip starts. Hosts may not discriminate unlawfully.

## Guests
Guests must be the approved driver (additional drivers only where allowed), drive lawfully and safely, keep to the pickup and return times, mileage, fuel and geographic limits of the booking, and return the vehicle in the condition it was received, allowing for normal wear. No smoking, racing, towing, off-road use, sub-renting, commercial delivery or illegal use unless the listing explicitly allows it.

## Bookings, payment and deposits
Prices, fees, taxes, deposits and authorisation holds are shown before you book. Payments are processed by Stripe. We may charge the card or wallet on file for the booking, approved extensions, and post-trip charges such as late return, fuel, cleaning, tolls, tickets and damage, supported by evidence and within the limits shown in the app. A booking is confirmed when the host accepts (or instantly, where instant booking applies) and payment succeeds.

## Handover, condition photos and return
Each trip uses timestamped inspection photos taken live in the app before and after the trip. These photos are the reference for any later damage claim. Starting the trip may require a pickup code, host inspection and an odometer reading. A return completes when the host confirms it, or automatically after the confirmation window in the app if no issue is raised.

## Cancellation, no-shows and late returns
Cancellations are governed by the cancellation policy shown on the booking, which determines any refund. If a guest does not appear, or a host does not make the vehicle available, the no-show rules in the app apply. Late returns may be charged and may affect the next booking.

## Extensions
A guest may ask to extend a trip; it depends on host approval and availability. If the vehicle is committed to another guest, the platform may offer a comparable replacement vehicle or decline the extension.

## Damage, accidents, claims and disputes
Report any accident, damage, theft or emergency immediately in the app and, where appropriate, to police. Either party may open a claim with evidence. We review claims and may decide them based on the evidence, including photos and logs; decisions may result in charges to the responsible party or payouts to the affected party. Fines, tolls, towing, impound and tickets during a trip are the guest's responsibility. Chargebacks filed without first raising the issue with us may result in account suspension.

## Insurance
Coverage depends on the protection plan and the host's and guest's own insurance. [INSURANCE ARRANGEMENTS AND DISCLAIMERS TO BE COMPLETED WITH YOUR INSURER AND COUNSEL]. Nothing here creates insurance where none exists.

## Safety recalls and vehicle unavailability
A vehicle with an open safety recall or safety issue may be paused or removed. If a booked vehicle becomes unavailable, we will try to offer a replacement or a refund.

## Location and monitoring
Where you permit it, we use device location and vehicle tracking features described in our Privacy Policy for inspection stamping, trip status and safety.

## Prohibited conduct
Fraud, false documents, circumventing platform payments, harassment, misuse of others' data, interfering with the service, or attempting to access other people's accounts. We may suspend or terminate for violations.

## Fees and payouts
Hosts receive earnings after the trip and hold window, less the service fee shown in the app, through Stripe Connect once payout setup is complete. We may hold or reverse payouts for chargebacks, refunds or open disputes.

## Disclaimers and limits
The service is provided "as is" to the extent allowed by law. To the extent allowed by law, CatoDrive is not liable for indirect or consequential damages, and our total liability for any claim is limited to [LIABILITY CAP]. Some jurisdictions do not allow certain limits, so they may not apply to you.

## Indemnity
You agree to indemnify CatoDrive against claims arising from your breach of these terms or unlawful use of a vehicle or the service, to the extent allowed by law.

## Disputes, governing law and arbitration
[GOVERNING LAW, VENUE, AND WHETHER TO INCLUDE ARBITRATION / CLASS-ACTION WAIVER — ATTORNEY REVIEW REQUIRED BEFORE PUBLISHING].

## Electronic communications
You agree to receive notices and agreements electronically, including by email, in-app and push message, and to sign electronically.

## Changes
We may update these terms; the date above shows the latest version, and continued use means you accept them. We will notify you of material changes.

## Contact
**[LEGAL ENTITY NAME]**, [POSTAL ADDRESS] · **[SUPPORT EMAIL]**
`,
  },
] as const;
