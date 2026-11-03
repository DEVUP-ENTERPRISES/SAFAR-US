/** The standard Asset Partner Agreement, built from CatoDrive's consolidated draft and how the platform actually runs. Staff edit it before publishing. */
export const STANDARD_AGREEMENT = {
  title: 'Asset Partner Agreement',
  body: `[BEFORE PUBLISHING: have Texas counsel review this text, fill CatoDrive's legal notice address in section 19, then delete this line.]

CATODRIVE, INC.
ASSET PARTNER AGREEMENT
Vehicle Enrollment, Fleet Operations, Partner Earnings and Onboarding

This Asset Partner Agreement (the "Agreement") is made on {{effective_date}} (the "Effective Date") between CatoDrive, Inc., a Texas corporation headquartered in Dallas, Texas ("CatoDrive"), and the vehicle owner named below (the "Partner").

PARTNER
Full legal name: {{partner_name}}
Email: {{partner_email}}
Phone: {{partner_phone}}
Mailing address: {{partner_address}}
Driver's licence: {{licence}}

VEHICLE
Vehicle: {{vehicle}}
VIN: {{vin}}
Plate: {{plate}}

1. PURPOSE
The Partner places the vehicle with CatoDrive, which lists, prices, delivers, cleans, maintains and rents it to screened guests on the CatoDrive platform. The Partner keeps ownership of the vehicle.

2. DOCUMENTS AND EXHIBITS
The following form part of this Agreement once completed in the Partner portal or at intake:
Exhibit A - Vehicle Addendum and Intake Condition Report
Exhibit B - Payment Method Election
Exhibit C - Personal Use Request procedure
Exhibit E - Onboarding Checklist
Exhibit F - Insurance Coverage Election
Exhibit G - Insurance Waiver (only if the Partner declines CatoDrive's fleet coverage)
The separate Non-Disclosure Agreement signed by the Partner also applies.

3. PARTNER DOCUMENTS
Before the vehicle is activated the Partner provides, through the Partner portal: a government photo ID or driver's licence (or completes the online ID check); the vehicle title or loan papers with the lender's details; current Texas registration in the Partner's name with a passed state inspection; the current personal auto insurance declarations page; and IRS Form W-9 (or W-8BEN for a non-U.S. person). The Partner also hands over two working keys or fobs, any wheel-lock key, and any charging cable and manufacturer accessories.
The Partner keeps the registration, inspection and personal insurance current for the whole term and uploads renewals before they expire. A vehicle whose required documents have expired is paused until they are renewed.

4. INTAKE AND CONDITION REPORT (EXHIBIT A)
At intake a CatoDrive representative inspects and photographs the vehicle and records its year, make, model, VIN, odometer reading and any existing damage in Exhibit A, which both parties sign. The Partner may object in writing through the Partner portal within three (3) business days after CatoDrive signs the report. After that period, or once the Partner acknowledges it, the report is the conclusive record of the vehicle's condition at intake.
CatoDrive aims to list the vehicle within three to five business days after intake; this is a typical timeframe, not a guarantee.

5. EARNINGS
5.1 Gross Earnings means the rental price guests pay for completed trips in the vehicle, before sales and rental taxes, protection plans, deposits, and fees that belong to CatoDrive or third parties.
5.2 CatoDrive keeps a management fee of {{management_fee}} of Gross Earnings. The Partner's share is the rest.
5.3 A trip counts in the calendar month it is completed. Cancelled and refunded trips are not counted; a refund or chargeback after a month is closed is adjusted in the next statement.
5.4 Net Partner Earnings for a month = the Partner's share, less the monthly service fees in section 7, less repairs under section 10, plus any toll or ticket amounts the Partner paid and CatoDrive accepted under section 11.
5.5 The Partner can see a live statement for every month in the Partner portal and download it as a PDF, with every completed trip listed. Questions about a statement must be raised in writing within 30 days of it becoming final.

6. PAYMENT OF EARNINGS (EXHIBIT B)
CatoDrive pays Net Partner Earnings once a month, on {{payout_day}}, for the previous month, by the method the Partner elects in Exhibit B:
Option A - Zelle to {{zelle_handle}}, an account in the name {{zelle_name}} held in the Partner's own name at a U.S. bank.
Option B - Mailed check payable to {{check_payable_to}} at {{check_address}}. A check is on time when mailed on the payout day; postal time is outside CatoDrive's control.
Payout method chosen: {{payout_method}}.
No payout is made for a month whose costs are more than its earnings.

7. MONTHLY SERVICE FEES
7.1 Car wash and detailing: {{detailing_monthly}} per vehicle per month.
7.2 CatoDrive fleet insurance (Roamly), only if elected in Exhibit F: {{insurance_monthly}} per vehicle per month.
7.3 These fees apply for every month the vehicle is in the programme, whether or not it is booked, and are deducted from that month's earnings. If a month's earnings do not cover them, the balance is carried to the next statement.

8. INSURANCE (EXHIBITS F AND G)
The Partner elects one option in Exhibit F through the Partner portal:
Option A - CatoDrive fleet coverage (Roamly) at {{insurance_monthly}} per month, covering the vehicle while in CatoDrive's custody between bookings, including valet transport, staging, cleaning and storage. For damage while the vehicle is with CatoDrive or a guest, the Partner's share of any unrecovered repair cost is capped at {{deductible_cap}} per incident; CatoDrive absorbs the rest.
Option B - The Partner's own insurance. The fleet fee does not apply, the damage cap does not apply, and the Partner must sign the Insurance Waiver (Exhibit G) before activation. The Partner should obtain written confirmation from their insurer that the policy permits commercial or peer-to-peer rental and use by CatoDrive personnel.
Under either option the Partner keeps their personal auto insurance current; fleet coverage does not replace it.

9. TOLL TAGS
CatoDrive runs the vehicle on its own commercial toll account and transponder. Before intake the Partner deactivates, suspends or removes every personal toll tag (NTTA TollTag, TxTag or similar), removes or defaces any toll sticker, and confirms this in the Partner portal. The Partner must not reinstall or reactivate a personal tag during the term.

10. MAINTENANCE, REPAIRS AND DAMAGE
10.1 CatoDrive schedules and coordinates routine maintenance. Work estimated above {{maintenance_approval}} needs the Partner's approval in the Partner portal before it goes ahead; work at or below that amount proceeds without it.
10.2 The cost of approved repairs and maintenance (other than cleaning, which the detailing fee covers) is deducted from Net Partner Earnings in the month the work is completed, and shown on the statement.
10.3 For damage caused during a trip, CatoDrive pursues the guest under its rental terms. The Partner's share of any repair cost CatoDrive cannot recover is limited as set out in section 8.
10.4 CatoDrive pauses the vehicle for any open safety recall until it is repaired.

11. TOLLS, TICKETS AND NOTICES
11.1 Guests are responsible for tolls, parking and traffic citations, towing and impound charges, and related late fees incurred during their trip.
11.2 Because notices are sent to the registered owner, the Partner uploads any toll invoice, violation, collections or impound notice for the vehicle in the Partner portal within 24 hours of receiving it, and before its due date, including notices about earlier activity.
11.3 CatoDrive matches each notice to the trip that had the vehicle and charges that guest. If the Partner already paid the notice and CatoDrive accepts it, the amount is refunded on the Partner's next statement. If the Partner has not paid it, CatoDrive pays the agency. Notices for periods when the vehicle was with the Partner are the Partner's responsibility.

12. PERSONAL USE (EXHIBIT C)
The Partner may ask to use the vehicle on specific dates through the Partner portal. CatoDrive approves requests that do not conflict with confirmed bookings and blocks those dates. The vehicle is returned on time, clean and with the same fuel or charge level. Dates already booked by guests cannot be taken back.

13. ACTIVATION
The vehicle is listed only after: required documents are received; this Agreement and the NDA are signed; Exhibit B, Exhibit F and (if applicable) Exhibit G are completed; toll tags are confirmed deactivated; intake is completed and Exhibit A signed.

14. TERM AND RETURNS
14.1 This Agreement starts on the Effective Date and continues until ended under this section.
14.2 The Partner may end it for any vehicle by asking for the vehicle back in the Partner portal with thirty (30) days' notice. CatoDrive completes trips already booked inside the notice period.
14.3 CatoDrive may end it with thirty (30) days' written notice, or immediately for a material breach not cured within ten (10) days of notice.
14.4 On return CatoDrive removes its toll transponder, tracker and fleet coverage, returns all keys and accessories, records the vehicle's condition, and pays the final statement on the next payout day.
14.5 If CatoDrive cannot reach the Partner, the vehicle stays in the programme and its earnings are held until contact is restored. If the Partner dies, earnings are held for their estate and the vehicle continues earning until the estate's representative gives instructions.

15. PARTNER WARRANTIES
The Partner confirms that they own the vehicle or are authorised by its owner and any lender to enter this Agreement, that the information they give is accurate, and that they will tell CatoDrive promptly of any change in ownership, lien, registration or insurance.

16. LIABILITY
Except for its own gross negligence or wilful misconduct, CatoDrive's total liability under this Agreement in any twelve-month period is limited to the management fees it received for the vehicle in that period. Neither party is liable for indirect or consequential losses. The Partner indemnifies CatoDrive against claims arising from inaccurate ownership or insurance information the Partner supplied.

17. CONFIDENTIALITY
The separate Non-Disclosure Agreement governs confidential information. If it and this Agreement differ, the NDA prevails on confidentiality.

18. CHANGES
CatoDrive may change the fees or terms by giving the Partner at least 30 days' notice through the Partner portal; the Partner may end the Agreement under section 14.2 instead of accepting a change. Changes take effect only after the Partner accepts them or the notice period ends.

19. NOTICES, LAW AND DISPUTES
Notices to the Partner are given through the Partner portal and by email to the address above. Legal notices to CatoDrive go to: [CatoDrive legal notice address]. This Agreement is governed by the laws of the State of Texas, and the parties submit to the state and federal courts in Dallas County, Texas. If any part is unenforceable, the rest remains in effect. This Agreement, its exhibits and the NDA are the entire agreement between the parties on this subject.

20. ELECTRONIC SIGNATURE
The parties agree to sign electronically. The Partner's typed name below, the date and time, and the device and network details recorded with it form the Partner's signature, with the same effect as a handwritten one.

PARTNER
Signature: {{signed_name}}
Date: {{effective_date}}

CATODRIVE, INC.
Authorised representative: Syed Ali Iqbal, CEO and Co-Founder
`,
};
