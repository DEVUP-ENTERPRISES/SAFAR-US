import type { RejectionReason } from '../infrastructure/asset-partner-application.model';

/** What each decline reason means to the applicant and what would change the answer. */
export const REJECTION_COPY: Record<RejectionReason, { label: string; why: string; improve: string }> = {
  vehicle_age: { label: 'Vehicle age', why: 'Your car is older than the model years we place with guests today.', improve: 'A newer car is likely to qualify.' },
  mileage: { label: 'Mileage', why: 'The mileage is higher than we can take on right now.', improve: 'A car with lower mileage is likely to qualify.' },
  title: { label: 'Title or ownership', why: 'The title is branded (salvage, rebuilt or similar) or the ownership papers didn’t match.', improve: 'Apply with a car that has a clean title in your name, or send the correct ownership papers.' },
  accident_history: { label: 'Accident history', why: 'The accident history means we can’t insure the car for rentals right now.', improve: 'A car without major accident history is likely to qualify.' },
  condition: { label: 'Condition', why: 'The car needs work before guests can drive it.', improve: 'Fix the items in our note, then apply again with new photos.' },
  insurance: { label: 'Insurance', why: 'We couldn’t confirm active insurance on the car.', improve: 'Apply again with a current insurance declarations page.' },
  documents: { label: 'Missing papers', why: 'Some papers were missing or hard to read.', improve: 'Apply again with clear photos or PDFs of every paper.' },
  identity: { label: 'Identity', why: 'We couldn’t confirm your identity.', improve: 'Apply again and make sure the name matches your driver’s licence.' },
  service_area: { label: 'Service area', why: 'The car is outside the area we serve today.', improve: 'We’ll be glad to hear from you if the car can be kept in our service area.' },
  demand: { label: 'Fleet is full', why: 'We already have enough cars like this one.', improve: 'Demand changes through the year, so please apply again later.' },
  other: { label: 'Other', why: 'See the note from our team.', improve: 'Follow the note from our team, then apply again.' },
};

export function explainRejection(reasons: RejectionReason[]) {
  return reasons.map((code) => ({ code, ...REJECTION_COPY[code] }));
}
