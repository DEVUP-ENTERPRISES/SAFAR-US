import type { UserDoc } from '../infrastructure/user.model';

/**
 * Account setup gate.
 *
 * A guest can sign up with just an email, but they cannot be handed a car until
 * we hold the identity a rental — and its insurer — actually requires: a legal
 * name that matches a licence, a date of birth that clears the minimum rental
 * age, a reachable phone, a billing/home address, a face on the profile, and an
 * emergency contact. This module is the single source of truth for "is that
 * set", so the API gate, the onboarding submit and the UI never drift.
 *
 * It is deliberately data-only and side-effect free: it reads a user and the
 * configured minimum age and reports what is missing. Enforcement lives at the
 * edges (a route gate; the booking path already refuses ineligible guests).
 */
export type ProfileField =
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'phone'
  | 'address'
  | 'avatar'
  | 'emergencyContact';

export const REQUIRED_PROFILE_FIELDS: readonly ProfileField[] = [
  'firstName', 'lastName', 'dateOfBirth', 'phone', 'address', 'avatar', 'emergencyContact',
] as const;

/** Human copy per field — one place, so API and UI never diverge. */
export const PROFILE_FIELD_COPY: Record<ProfileField, string> = {
  firstName: 'Legal first name',
  lastName: 'Legal last name',
  dateOfBirth: 'Date of birth',
  phone: 'Mobile number',
  address: 'Home address',
  avatar: 'Profile photo',
  emergencyContact: 'Emergency contact',
};

export interface ProfileStatus {
  complete: boolean;
  missing: ProfileField[];
  /** True only when a DOB is present but below the minimum rental age. */
  underage: boolean;
  minAgeYears: number;
}

/** Whole, complete years between a date of birth and now. Null if unparseable. */
export function ageInYears(dob: string | Date | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

function hasUsableAddress(user: Pick<UserDoc, 'addresses'>): boolean {
  return (user.addresses ?? []).some(
    (a) => !!a && !!a.line1 && !!a.city && !!a.state && !!a.country,
  );
}

/** Evaluate a user's setup completeness against the configured minimum age. */
export function evaluateProfile(
  user: Pick<UserDoc, 'firstName' | 'lastName' | 'dateOfBirth' | 'phone' | 'avatarUrl' | 'addresses' | 'emergencyContacts'>,
  opts: { minAgeYears: number },
  now = new Date(),
): ProfileStatus {
  const missing: ProfileField[] = [];
  if (!user.firstName?.trim()) missing.push('firstName');
  if (!user.lastName?.trim()) missing.push('lastName');

  const age = ageInYears(user.dateOfBirth, now);
  const underage = age != null && age < opts.minAgeYears;
  // A missing OR under-age DOB both fail the gate — you cannot complete setup
  // with a birth date that does not clear the minimum rental age.
  if (age == null || underage) missing.push('dateOfBirth');

  if (!user.phone?.trim()) missing.push('phone');
  if (!hasUsableAddress(user)) missing.push('address');
  if (!user.avatarUrl?.trim()) missing.push('avatar');
  if (!(user.emergencyContacts ?? []).some((c) => c && c.name && c.phone)) {
    missing.push('emergencyContact');
  }

  return { complete: missing.length === 0, missing, underage, minAgeYears: opts.minAgeYears };
}
