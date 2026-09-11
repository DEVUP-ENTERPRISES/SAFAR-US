import { evaluateProfile, ageInYears, REQUIRED_PROFILE_FIELDS } from './profile-completion';

const complete = {
  firstName: 'Sam',
  lastName: 'Rivera',
  dateOfBirth: '1995-06-15',
  phone: '+14155550101',
  avatarUrl: 'https://cdn.example.com/a.jpg',
  addresses: [
    { id: '1', label: 'Home', line1: '1 Main St', city: 'Dallas', state: 'TX', zip: '75001', country: 'US', isDefault: true },
  ],
  emergencyContacts: [{ id: '1', name: 'Jo', phone: '+14155550102' }],
};
const opts = { minAgeYears: 18 };

describe('ageInYears', () => {
  const now = new Date('2026-06-15T00:00:00Z');
  it('counts whole years and handles the birthday boundary', () => {
    expect(ageInYears('1995-06-15', now)).toBe(31);
    expect(ageInYears('1995-06-16', now)).toBe(30); // birthday not yet reached
    expect(ageInYears('2008-06-15', now)).toBe(18);
  });
  it('returns null for a missing or unparseable date', () => {
    expect(ageInYears(undefined, now)).toBeNull();
    expect(ageInYears('not-a-date', now)).toBeNull();
  });
});

describe('evaluateProfile', () => {
  it('passes a fully set-up account', () => {
    const s = evaluateProfile(complete, opts);
    expect(s.complete).toBe(true);
    expect(s.missing).toEqual([]);
    expect(s.underage).toBe(false);
  });

  it('flags every required field when nothing is set', () => {
    const s = evaluateProfile({ addresses: [], emergencyContacts: [] }, opts);
    expect(s.complete).toBe(false);
    expect(s.missing.sort()).toEqual([...REQUIRED_PROFILE_FIELDS].sort());
  });

  it('requires a usable address (all parts present)', () => {
    const s = evaluateProfile(
      { ...complete, addresses: [{ id: '1', label: 'Home', line1: '1 Main St', city: 'Dallas', state: '', zip: '75001', country: 'US', isDefault: true }] },
      opts,
    );
    expect(s.missing).toContain('address');
  });

  it('requires an emergency contact with a name and phone', () => {
    const s = evaluateProfile({ ...complete, emergencyContacts: [{ id: '1', name: 'Jo', phone: '' }] }, opts);
    expect(s.missing).toContain('emergencyContact');
  });

  it('rejects an under-age DOB and marks it', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const s = evaluateProfile({ ...complete, dateOfBirth: '2012-01-01' }, opts, now);
    expect(s.underage).toBe(true);
    expect(s.missing).toContain('dateOfBirth');
    expect(s.complete).toBe(false);
  });

  it('respects a configurable minimum age', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    // A 20-year-old passes at 18 but fails at 21.
    const twenty = { ...complete, dateOfBirth: '2006-01-01' };
    expect(evaluateProfile(twenty, { minAgeYears: 18 }, now).complete).toBe(true);
    expect(evaluateProfile(twenty, { minAgeYears: 21 }, now).missing).toContain('dateOfBirth');
  });
});
