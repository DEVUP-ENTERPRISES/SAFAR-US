import type { ContactInterest } from './api';

/** Ways to reach CatoDrive, shown on the contact page. */
export const CONTACT = {
  /** For people listing their car with CatoDrive only; never shown to guests for trips. */
  assetPartnerHotlineDisplay: '(214) 814-0402',
  assetPartnerHotlineHref: 'tel:+12148140402',
  email: 'shoaib@catodrive.com',
  location: 'Dallas/Fort Worth, TX',
  hours: 'Mon–Sun: 8 AM – 10 PM Central',
  /** DFW Airport, where operations are centred. */
  mapCenter: { lat: 32.8998, lng: -97.0403 },
} as const;

export const CONTACT_CARDS = [
  { key: 'email', title: 'Email Us', lines: [CONTACT.email, 'Questions about your account or a trip', 'Corporate accounts'] },
  { key: 'call', title: 'Asset Partner hotline', lines: [CONTACT.assetPartnerHotlineDisplay, 'For car owners listing with CatoDrive', '8 AM – 10 PM Central'] },
  { key: 'visit', title: 'Visit Us', lines: ['Dallas/Fort Worth, TX', 'Operations near DFW Airport', 'By appointment only'] },
] as const;

export const INTEREST_OPTIONS: { value: ContactInterest; label: string }[] = [
  { value: 'asset_partner', label: 'Listing my vehicle as an Asset Partner' },
  { value: 'investor', label: 'Investing in CatoDrive' },
  { value: 'corporate', label: 'A corporate account' },
  { value: 'general', label: 'A general question' },
  { value: 'other', label: 'Something else' },
];

export const CONTACT_FAQ = [
  { q: 'How do I become an asset partner?', a: 'Start the intake form on the Asset Partners page - it takes about 10 minutes. Our team reviews every submission and schedules an in-person vehicle assessment within 2–3 business days.' },
  { q: 'What’s the fastest way to reach you?', a: `Send us a message with the form below or email ${CONTACT.email}; we reply within 24 hours. Car owners interested in becoming an Asset Partner can call or text our Asset Partner hotline, ${CONTACT.assetPartnerHotlineDisplay}.` },
  { q: 'Do you offer corporate accounts?', a: 'Yes - B2B fleet accounts for enterprises and staffing agencies, with volume pricing and consolidated billing. Select "A corporate account" below and tell us your team size and use case.' },
  { q: 'Where are you located?', a: 'CatoDrive operates near DFW International Airport and Dallas Love Field, serving the greater Dallas/Fort Worth area. Our office is by appointment only - reach out to schedule a visit.' },
] as const;

/** The contact form's own checks: field keys that are missing or invalid. */
export function contactFormErrors(f: { fullName: string; email: string; interest: string; message: string }): Set<string> {
  const errors = new Set<string>();
  if (!f.fullName.trim()) errors.add('fullName');
  if (!/^\S+@\S+\.\S+$/.test(f.email)) errors.add('email');
  if (!f.interest) errors.add('interest');
  if (f.message.trim().length < 5) errors.add('message');
  return errors;
}
