/**
 * Vehicle lifecycle engine against a real in-memory MongoDB. Proves the
 * transition contract the spec requires: validated, concurrency-safe,
 * idempotent, auditable via an append-only timeline that cannot be rewritten.
 */
import { vehicleLifecycleService } from './vehicle-lifecycle.service';
import { VehicleModel } from '../infrastructure/vehicle.model';
import { VehicleEventModel } from '../infrastructure/vehicle-event.model';
import { AppError } from '../../../core/errors/app-error';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function makeVehicle(over: Record<string, unknown> = {}): Promise<string> {
  const v = await VehicleModel.create({
    hostId: 'host-1',
    make: 'Toyota',
    model: 'Camry',
    year: 2022,
    bodyType: 'sedan',
    transmission: 'automatic',
    fuelType: 'petrol',
    seats: 5,
    location: { type: 'Point', coordinates: [-96.8, 32.78], address: 'Dallas', city: 'Dallas' },
    listing: { title: 'Camry' },
    pricing: { dailyPrice: 6500 },
    ...over,
  });
  return v._id;
}

describe('VehicleLifecycleService.transition', () => {
  it('moves the state, persists it, and appends a state.changed event', async () => {
    const id = await makeVehicle();
    const ok = await vehicleLifecycleService.transition({
      vehicleId: id,
      to: 'on_trip',
      actor: { userId: 'guest-1' },
      reason: 'handover',
    });
    expect(ok.changed).toBe(true);
    expect(ok.from).toBe('idle');
    expect(ok.to).toBe('on_trip');

    expect(await vehicleLifecycleService.stateOf(id)).toBe('on_trip');
    const events = await vehicleLifecycleService.timeline(id);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('state.changed');
    expect(events[0].fromState).toBe('idle');
    expect(events[0].toState).toBe('on_trip');
    expect(events[0].seq).toBe(1);
  });

  it('rejects an illegal transition without changing state', async () => {
    const id = await makeVehicle({ operationalState: 'on_trip' });
    await expect(
      vehicleLifecycleService.transition({ vehicleId: id, to: 'maintenance', actor: { system: true } }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await vehicleLifecycleService.stateOf(id)).toBe('on_trip');
    expect(await VehicleEventModel.countDocuments({ vehicleId: id })).toBe(0);
  });

  it('is idempotent when the same idempotency key is replayed', async () => {
    const id = await makeVehicle();
    const key = 'trip.started:abc';
    const first = await vehicleLifecycleService.transition({
      vehicleId: id, to: 'on_trip', actor: { system: true }, idempotencyKey: key,
    });
    const second = await vehicleLifecycleService.transition({
      vehicleId: id, to: 'on_trip', actor: { system: true }, idempotencyKey: key,
    });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    // Only one event, despite two calls.
    expect(await VehicleEventModel.countDocuments({ vehicleId: id, kind: 'state.changed' })).toBe(1);
  });

  it('is concurrency-safe: two racing transitions never both win', async () => {
    const id = await makeVehicle();
    const results = await Promise.allSettled([
      vehicleLifecycleService.transition({ vehicleId: id, to: 'on_trip', actor: { system: true } }),
      vehicleLifecycleService.transition({ vehicleId: id, to: 'cleaning', actor: { system: true } }),
    ]);
    const winners = results.filter(
      (r) => r.status === 'fulfilled' && r.value.changed,
    );
    expect(winners).toHaveLength(1);
    // Exactly one state.changed event was written.
    expect(await VehicleEventModel.countDocuments({ vehicleId: id, kind: 'state.changed' })).toBe(1);
  });

  it('blocks new bookings when down, and clears on reactivation', async () => {
    const id = await makeVehicle();
    await vehicleLifecycleService.transition({ vehicleId: id, to: 'maintenance', actor: { system: true }, reason: 'oil due' });
    expect(await vehicleLifecycleService.isOperableForBooking(id)).toBe(false);

    const down = await VehicleModel.findById(id).lean<{ lifecycle?: { downSince?: Date; downReason?: string } }>();
    expect(down?.lifecycle?.downSince).toBeInstanceOf(Date);
    expect(down?.lifecycle?.downReason).toBe('oil due');

    await vehicleLifecycleService.transition({ vehicleId: id, to: 'idle', actor: { system: true } });
    expect(await vehicleLifecycleService.isOperableForBooking(id)).toBe(true);
    const up = await VehicleModel.findById(id).lean<{ lifecycle?: { downSince?: Date } }>();
    expect(up?.lifecycle?.downSince).toBeUndefined();
  });
});

describe('VehicleEvent timeline', () => {
  it('is append-only — updates and deletes are rejected', async () => {
    const id = await makeVehicle();
    await vehicleLifecycleService.record({
      vehicleId: id, kind: 'lifecycle.note', summary: 'note', actor: { system: true },
    });
    await expect(
      VehicleEventModel.updateOne({ vehicleId: id }, { $set: { summary: 'tampered' } }),
    ).rejects.toThrow(/append-only/i);
    await expect(
      VehicleEventModel.deleteMany({ vehicleId: id }),
    ).rejects.toThrow(/append-only/i);
  });

  it('returns events newest-first with a monotonic per-vehicle sequence', async () => {
    const id = await makeVehicle();
    for (let i = 0; i < 3; i++) {
      await vehicleLifecycleService.record({
        vehicleId: id, kind: 'lifecycle.note', summary: `note ${i}`, actor: { system: true },
      });
    }
    const events = await vehicleLifecycleService.timeline(id);
    expect(events.map((e) => e.seq)).toEqual([3, 2, 1]);
  });

  it('skips silently when the vehicle does not exist', async () => {
    const res = await vehicleLifecycleService.record({
      vehicleId: 'nope', kind: 'lifecycle.note', summary: 'x', actor: { system: true },
    });
    expect(res).toBeNull();
  });
});
