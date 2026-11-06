/** Title brands a U.S. title can carry; only a clean title is accepted into the programme. */
export const TITLE_STATUSES = ['clean', 'salvage', 'rebuilt', 'flood', 'lemon'] as const;
export type TitleStatus = (typeof TITLE_STATUSES)[number];

/** Photos every application needs, by the slot name the form gives them. */
export const REQUIRED_PHOTOS = ['Front', 'Rear', 'Odometer'] as const;

/** Seasonal commitments longer than six months come only as a full year. */
export const SEASON_MAX_SHORT_MONTHS = 6;
export const SEASON_YEAR_MONTHS = 12;

export const TITLE_REFUSAL: Record<Exclude<TitleStatus, 'clean'>, string> = {
  salvage: 'We can only accept cars with a clean title. A salvage title means an insurer once declared the car a total loss.',
  rebuilt: 'We can only accept cars with a clean title. A rebuilt or reconstructed title still counts as branded for our fleet insurance.',
  flood: 'We can only accept cars with a clean title. A flood title can hide electrical and safety problems.',
  lemon: 'We can only accept cars with a clean title. A lemon (manufacturer buyback) title is a branded title.',
};

/** Whether a seasonal length is allowed: from the minimum up to six months, or a full year. */
export function seasonMonthsAllowed(months: number | undefined, minMonths: number): boolean {
  if (!Number.isInteger(months)) return false;
  return (months! >= minMonths && months! <= SEASON_MAX_SHORT_MONTHS) || months === SEASON_YEAR_MONTHS;
}

export type Ownership = 'owned' | 'financed' | 'leased';

// Exhibit E proof of ownership, worded for how the car is held.
export const OWNERSHIP_PAPERS: Record<Ownership, { label: string; hint: string }> = {
  owned: { label: 'Vehicle title', hint: 'Front and back of the Texas title in your name' },
  financed: { label: 'Loan statement', hint: 'A recent loan statement or payoff letter showing the lender and the car' },
  leased: { label: 'Lease agreement and permission', hint: 'Your lease plus the leasing company’s written OK to rent the car out' },
};
