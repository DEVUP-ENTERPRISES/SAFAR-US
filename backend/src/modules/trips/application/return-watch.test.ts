import { returnWatchService } from './return-watch.service';
import { tripService } from './trip.service';
import { bookingService } from '../../bookings/application/booking.service';
import { lateFeeCents, dayPriceCents } from '../../bookings/domain/late-fee';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import type { TripDoc } from '../infrastructure/trip.model';
import * as bus from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

const MIN = 60_000;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockResolvedValue({
    ...real,
    tracking: { ...real.tracking, overdueGraceMinutes: 10, returnReminderMinutes: [60, 15], nextBookingAlertHours: 24 },
  });
});

describe('late fee bands', () => {
  const rule = { perHourCents: 2500, hourlyMaxHours: 6, halfDayMaxHours: 12, dayCents: 8000 };
  it('charges by the hour, then adds a half day, then whole days, and never drops', () => {
    expect(lateFeeCents(0, rule)).toBe(0);
    expect(lateFeeCents(1, rule)).toBe(2500);
    expect(lateFeeCents(6, rule)).toBe(15000);
    expect(lateFeeCents(7, rule)).toBe(19000);
    expect(lateFeeCents(12, rule)).toBe(19000);
    expect(lateFeeCents(13, rule)).toBe(23000);
    expect(lateFeeCents(24, rule)).toBe(23000);
    expect(lateFeeCents(25, rule)).toBe(31000);
    let last = 0;
    for (let h = 1; h <= 72; h++) {
      const fee = lateFeeCents(h, rule);
      expect(fee).toBeGreaterThanOrEqual(last);
      last = fee;
    }
  });
  it('reads the day price from the booking', () => {
    expect(dayPriceCents({ days: 3, base: { amount: 24000 } })).toBe(8000);
    expect(dayPriceCents({})).toBe(0);
  });
});

describe('when the car was back', () => {
  const arrival = (trip: Partial<TripDoc>, hostSide: boolean, now: Date) =>
    (tripService as unknown as { arrivalOf: (t: Partial<TripDoc>, h: boolean, n: Date, m: number) => { at: Date; basis: string } }).arrivalOf(trip, hostSide, now, 2);
  const photo = (minAgo: number, by = 'guest', located = true) => ({
    phase: 'post' as const, byUserId: by, at: new Date(Date.now() - minAgo * MIN), url: 'x', ...(located ? { lat: 32.8, lng: -96.8 } : {}),
  });

  it('counts from the guest’s return photos at the car, not from when the host ends the trip', () => {
    const now = new Date();
    const r = arrival({ guestId: 'guest', photos: [photo(90), photo(85), photo(80)] as never }, true, now);
    expect(r.basis).toBe('guest_photos');
    expect(now.getTime() - r.at.getTime()).toBeGreaterThanOrEqual(85 * MIN - 1000);
  });

  it('ignores photos without a location or by the host, and falls back to who ended the trip', () => {
    const now = new Date();
    expect(arrival({ guestId: 'guest', photos: [photo(90, 'host'), photo(85, 'guest', false)] as never }, true, now)).toMatchObject({ basis: 'host_ended', at: now });
    expect(arrival({ guestId: 'guest', photos: [] }, false, now)).toMatchObject({ basis: 'guest_ended' });
  });
});

describe('around return time', () => {
  const trip = (endInMin: number, extra: Record<string, unknown> = {}) =>
    BookingModel.collection.insertOne({
      _id: 'late' as never, code: 'CD-1', guestId: 'g1', hostId: 'h1', vehicleId: 'car', status: 'in_progress', deletedAt: null,
      period: { start: new Date(Date.now() - 86_400_000), end: new Date(Date.now() + endInMin * MIN) }, ...extra,
    });

  it('sends each reminder once, the most urgent when several fall due together', async () => {
    const emit = jest.spyOn(bus, 'emit');
    await trip(50);
    expect(await returnWatchService.remind(Date.now())).toBe(1);
    expect(await returnWatchService.remind(Date.now())).toBe(0);
    await BookingModel.updateOne({ _id: 'late' }, { $set: { 'period.end': new Date(Date.now() + 10 * MIN) } });
    expect(await returnWatchService.remind(Date.now())).toBe(1);
    const sent = emit.mock.calls.filter(([n]) => n === EVENTS.TRIP_RETURN_REMINDER).map(([, , p]) => (p as { minutesLeft: number }).minutesLeft);
    expect(sent).toEqual([50, 10]);
  });

  it('flags the car overdue as soon as the 10-minute grace ends, once', async () => {
    const emit = jest.spyOn(bus, 'emit');
    await trip(-5);
    expect(await bookingService.sweepOverdueLate()).toBe(0);
    await BookingModel.updateOne({ _id: 'late' }, { $set: { 'period.end': new Date(Date.now() - 11 * MIN) } });
    expect(await bookingService.sweepOverdueLate()).toBe(1);
    expect(await bookingService.sweepOverdueLate()).toBe(0);
    expect(emit.mock.calls.filter(([n]) => n === EVENTS.BOOKING_OVERDUE)).toHaveLength(1);
  });

  it('alerts once about the next booking and offers that guest a similar car', async () => {
    const emit = jest.spyOn(bus, 'emit');
    const offer = jest.spyOn(bookingService, 'offerLateSwap').mockResolvedValue('2024 Toyota RAV4');
    await trip(-20, { overdueNotifiedAt: new Date() });
    await BookingModel.collection.insertOne({
      _id: 'next' as never, code: 'CD-2', guestId: 'g2', hostId: 'h1', vehicleId: 'car', status: 'paid', deletedAt: null,
      period: { start: new Date(Date.now() + 3 * 3_600_000), end: new Date(Date.now() + 27 * 3_600_000) },
    });
    expect(await returnWatchService.protectNextBookings(Date.now())).toBe(1);
    expect(await returnWatchService.protectNextBookings(Date.now())).toBe(0);
    expect(offer).toHaveBeenCalledWith('next', 'late');
    const [, , payload] = emit.mock.calls.find(([n]) => n === EVENTS.NEXT_BOOKING_AT_RISK)!;
    expect(payload).toMatchObject({ nextBookingId: 'next', nextGuestId: 'g2', offeredCar: '2024 Toyota RAV4' });
  });

  it('withdraws an open offer when the late car comes back, and the guest can decline', async () => {
    const emit = jest.spyOn(bus, 'emit');
    const open = { status: 'open', toVehicleId: 'c2', toName: 'RAV4', lateBookingId: 'late', offeredAt: new Date() };
    await BookingModel.collection.insertMany([
      { _id: 'n1' as never, code: 'CD-3', guestId: 'g2', swapOffer: open, deletedAt: null },
      { _id: 'n2' as never, code: 'CD-4', guestId: 'g3', swapOffer: open, deletedAt: null },
    ]);
    await bookingService.declineSwapOffer('g3', 'n2');
    await expect(bookingService.declineSwapOffer('g3', 'n2')).rejects.toThrow(/no longer available/);
    await bookingService.closeLateSwapOffers('late');
    expect((await BookingModel.findById('n1').lean())?.swapOffer?.status).toBe('expired');
    expect((await BookingModel.findById('n2').lean())?.swapOffer?.status).toBe('declined');
    expect(emit.mock.calls.filter(([n]) => n === EVENTS.NEXT_BOOKING_CLEARED)).toHaveLength(1);
  });
});
