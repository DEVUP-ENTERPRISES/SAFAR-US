import type { OnboardingInput } from './api';

/** Account setup: what a rental (and its insurer) requires before the first booking. */
export type SetupForm = {
  firstName: string; lastName: string; dateOfBirth: string; phone: string;
  line1: string; line2: string; city: string; state: string; zip: string; country: string;
  ecName: string; ecPhone: string; ecRelation: string;
};

export const EMPTY_SETUP: SetupForm = {
  firstName: '', lastName: '', dateOfBirth: '', phone: '',
  line1: '', line2: '', city: '', state: '', zip: '', country: 'US',
  ecName: '', ecPhone: '', ecRelation: '',
};

/** Every required item, in screen order; `id` is the field to bring into view when it's missing. */
export function setupChecklist(form: SetupForm): { key: keyof SetupForm; label: string; id: string; ok: boolean }[] {
  return [
    { key: 'firstName', label: 'Legal first name', id: 'firstName', ok: !!form.firstName.trim() },
    { key: 'lastName', label: 'Legal last name', id: 'lastName', ok: !!form.lastName.trim() },
    { key: 'dateOfBirth', label: 'Date of birth', id: 'dob', ok: !!form.dateOfBirth },
    { key: 'phone', label: 'Mobile number', id: 'phone', ok: !!form.phone.trim() },
    { key: 'line1', label: 'Street address', id: 'line1', ok: !!form.line1.trim() },
    { key: 'city', label: 'City', id: 'city', ok: !!form.city.trim() },
    { key: 'state', label: 'State / province', id: 'state', ok: !!form.state.trim() },
    { key: 'zip', label: 'ZIP / postal code', id: 'zip', ok: !!form.zip.trim() },
    { key: 'country', label: 'Country', id: 'country', ok: !!form.country.trim() },
    { key: 'ecName', label: 'Emergency contact name', id: 'ecName', ok: !!form.ecName.trim() },
    { key: 'ecPhone', label: 'Emergency contact phone', id: 'ecPhone', ok: !!form.ecPhone.trim() },
  ];
}

/** The onboarding request for a completed form. */
export function onboardingInput(form: SetupForm, avatarUrl?: string): OnboardingInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    dateOfBirth: form.dateOfBirth,
    phone: form.phone.trim(),
    avatarUrl,
    address: {
      line1: form.line1.trim(), line2: form.line2.trim() || undefined, city: form.city.trim(), state: form.state.trim(),
      zip: form.zip.trim(), country: form.country.trim(),
    },
    emergencyContact: { name: form.ecName.trim(), phone: form.ecPhone.trim(), relation: form.ecRelation.trim() || undefined },
  };
}
