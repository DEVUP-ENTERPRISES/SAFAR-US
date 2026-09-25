/** Only one instance may run a fallback job per interval. */
import { acquireJobLease } from './job-lease.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('acquireJobLease', () => {
  it('grants the first caller and refuses a second while the lease is held', async () => {
    expect(await acquireJobLease('expire-bookings', 60_000)).toBe(true);
    expect(await acquireJobLease('expire-bookings', 60_000)).toBe(false);
  });

  it('keeps different jobs independent', async () => {
    expect(await acquireJobLease('a', 60_000)).toBe(true);
    expect(await acquireJobLease('b', 60_000)).toBe(true);
  });

  it('grants the lease again once it has expired', async () => {
    expect(await acquireJobLease('a', 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(await acquireJobLease('a', 60_000)).toBe(true);
  });

  it('under a race exactly one caller wins', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => acquireJobLease('race', 60_000)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
