jest.mock('./eligibility.service', () => {
  const actual = jest.requireActual('./eligibility.service');
  return { ...actual, eligibilityService: { evaluate: jest.fn(), describe: actual.eligibilityService.describe.bind(actual.eligibilityService) } };
});
jest.mock('../../users/application/user.service', () => ({ userService: { profileStatus: jest.fn(async () => ({ complete: true, missing: [] })) } }));
jest.mock('../../trips/application/inspection.service', () => ({ inspectionService: { state: jest.fn() } }));
jest.mock('../../trips/application/tracking-phase.service', () => ({ trackingPhaseService: { resolve: jest.fn(async () => ({ phase: 'off' })) } }));

import { nextStepService } from './next-step.service';
import { eligibilityService } from './eligibility.service';
import { userService } from '../../users/application/user.service';
import { inspectionService } from '../../trips/application/inspection.service';
import { trackingPhaseService } from '../../trips/application/tracking-phase.service';
import { BookingModel, type BookingDoc } from '../infrastructure/booking.model';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { ReviewModel } from '../../reviews/infrastructure/review.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
  (eligibilityService.evaluate as jest.Mock).mockResolvedValue({ eligible: true, canRequest: true, blockers: [] });
  (userService.profileStatus as jest.Mock).mockResolvedValue({ complete: true, missing: [] });
  (inspectionService.state as jest.Mock).mockResolvedValue(photoState());
  (trackingPhaseService.resolve as jest.Mock).mockResolvedValue({ phase: 'off' });
});

const HOUR = 3_600_000;
const phase = (over: Record<string, unknown> = {}) => ({ open: false, taken: 0, required: 7, max: 30, opensAt: new Date(), closesAt: null, reason: 'not_yet', ...over });
const photoState = (pre = {}, post = {}) => ({ pre: phase(pre), post: phase(post) });

async function booking(over: Record<string, unknown> = {}): Promise<BookingDoc> {
  const start = new Date(Date.now() + 30 * HOUR);
  const b = await BookingModel.create({
    code: `TURA-${Math.random().toString(36).slice(2, 8)}`, guestId: 'g1', hostId: 'h1', vehicleId: 'v1', status: 'paid',
    period: { start, end: new Date(start.getTime() + 48 * HOUR) },
    priceBreakdown: { days: 2, currency: 'USD', total: { amount: 10000, currency: 'USD' } }, cancellationPolicy: 'flexible', statusHistory: [], ...over,
  });
  return b.toObject() as BookingDoc;
}
const step = async (over: Record<string, unknown> = {}) => nextStepService.forGuest(await booking(over), 'g1');

describe('trip co-pilot: the next step is always one clear thing', () => {
  it('unpaid: finish the payment', async () => {
    expect((await step({ status: 'pending_payment' })).key).toBe('pay');
  });

  it('waiting on the host, with their deadline', async () => {
    const s = await step({ status: 'pending_approval', approvalDeadline: new Date(Date.now() + 5 * HOUR) });
    expect(s).toMatchObject({ key: 'awaiting_host', tone: 'waiting' });
    expect(s.dueAt).toBeDefined();
  });

  it('profile first, then ID', async () => {
    (userService.profileStatus as jest.Mock).mockResolvedValue({ complete: false, missing: ['address'] });
    expect((await step()).key).toBe('profile');
  });

  it('an ID not yet submitted says verify, and is due by the cutoff', async () => {
    (eligibilityService.evaluate as jest.Mock).mockResolvedValue({ eligible: false, blockers: ['identity_not_submitted'] });
    const s = await step();
    expect(s).toMatchObject({ key: 'verify', action: { label: 'Verify ID' } });
    expect(new Date(s.dueAt!).getTime()).toBeLessThan(Date.now() + 30 * HOUR);
  });

  it('an ID being checked is a wait, not an action', async () => {
    (eligibilityService.evaluate as jest.Mock).mockResolvedValue({ eligible: false, blockers: ['identity_pending'] });
    expect((await step()).tone).toBe('waiting');
  });

  it('pickup photos once their window opens', async () => {
    (inspectionService.state as jest.Mock).mockResolvedValue(photoState({ open: true, taken: 2 }));
    expect((await step()).key).toBe('pickup_photos');
  });

  it('in the approach window: head to the car, or follow a delivery', async () => {
    (trackingPhaseService.resolve as jest.Mock).mockResolvedValue({ phase: 'approach' });
    expect((await step()).key).toBe('go');
    expect((await step({ delivery: { mode: 'home', address: '12 Oak St' } })).key).toBe('delivery');
  });

  it('all clear before pickup: you are all set', async () => {
    expect((await step()).key).toBe('ready');
  });

  it('during the trip: return photos when the return window opens', async () => {
    (inspectionService.state as jest.Mock).mockResolvedValue(photoState({}, { open: true, taken: 0, required: 4 }));
    const start = new Date(Date.now() - 46 * HOUR);
    expect((await step({ status: 'in_progress', period: { start, end: new Date(start.getTime() + 48 * HOUR) } })).key).toBe('return_photos');
  });

  it('past the end of the trip: a warning to return or extend', async () => {
    const start = new Date(Date.now() - 50 * HOUR);
    const s = await step({ status: 'in_progress', period: { start, end: new Date(start.getTime() + 48 * HOUR) } });
    expect(s).toMatchObject({ key: 'late', tone: 'warning' });
  });

  it('after the trip: rate it, then the receipt', async () => {
    const end = new Date(Date.now() - HOUR);
    const b = await booking({ status: 'completed', period: { start: new Date(end.getTime() - 48 * HOUR), end }, statusHistory: [{ from: 'in_progress', to: 'completed', at: end, by: 'system' }] });
    await TripModel.create({ bookingId: String(b._id), vehicleId: 'v1', guestId: 'g1', hostId: 'h1', status: 'completed', handover: { at: new Date() } });
    expect((await nextStepService.forGuest(b, 'g1')).key).toBe('review');
    await ReviewModel.create({ bookingId: String(b._id), direction: 'guest_to_host', authorId: 'g1', subjectId: 'h1', rating: 5 });
    expect((await nextStepService.forGuest(b, 'g1')).key).toBe('done');
  });

  it('a host cancellation offers another car', async () => {
    expect((await step({ status: 'cancelled_host' })).action?.href).toContain('/rebook');
  });
});
