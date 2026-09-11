import { createBookingSchema } from './booking.schemas';

/**
 * A booking is a contract, so acceptance of the Terms is not optional at the
 * edge of the API — the schema refuses a request that does not carry a version.
 * (The service separately checks that the version is the current one.)
 */
const base = {
  vehicleId: 'veh-1',
  start: '2026-10-01T10:00:00.000Z',
  end: '2026-10-03T10:00:00.000Z',
};

describe('createBookingSchema — Terms acceptance', () => {
  it('rejects a booking with no accepted terms version', () => {
    const r = createBookingSchema.safeParse(base);
    expect(r.success).toBe(false);
  });

  it('rejects a blank terms version', () => {
    const r = createBookingSchema.safeParse({ ...base, acceptedTermsVersion: '   ' });
    expect(r.success).toBe(false);
  });

  it('accepts a booking that carries a terms version', () => {
    const r = createBookingSchema.safeParse({ ...base, acceptedTermsVersion: '2026-09-01' });
    expect(r.success).toBe(true);
  });
});
