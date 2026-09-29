const listings = jest.fn();
jest.mock('../infrastructure/wheelbase.client', () => ({ fetchDealerListings: (...a: unknown[]) => listings(...a) }));

import { wheelbaseInsuranceService } from './wheelbase-insurance.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  listings.mockReset();
});

// Shaped like the dealer's real listings: two 2023 Traverses make a plain year/make/model match ambiguous.
const WB = [
  { id: 504956, name: '2024 Buick Envista', year: 2024, make: 'Buick', model: 'Envista', insuranceState: 'approved', coverage: 'normal', planLabel: 'Wheelbase Auto Driving', minRenterAge: 21 },
  { id: 504965, name: '2023 Chevrolet Traverse', year: 2023, make: 'Chevrolet', model: 'Traverse', insuranceState: 'approved', coverage: 'custom', minRenterAge: 21 },
  { id: 504501, name: '2023 Chevrolet Traverse FWD Premier', year: 2023, make: 'Chevrolet', model: 'Traverse FWD Premier', insuranceState: 'approved', coverage: 'normal', minRenterAge: 25 },
];

const car = (id: string, year: number, make: string, model: string) =>
  VehicleModel.collection.insertOne({ _id: id as never, year, make, model, status: 'listed', deletedAt: null });

describe('wheelbase insurance sync', () => {
  it('links a unique match, leaves an ambiguous one for an admin, and refreshes linked cars', async () => {
    listings.mockResolvedValue(WB);
    await car('buick', 2024, 'Buick', 'Envista');
    await car('traverse', 2023, 'Chevrolet', 'Traverse');

    const r = await wheelbaseInsuranceService.sync();
    expect(r).toMatchObject({ listings: 3, autoLinked: 1, unmatched: 1 });
    const buick = await VehicleModel.findById('buick').lean();
    expect(buick!.wheelbase).toMatchObject({ rentalId: 504956, linkedBy: 'auto', insuranceState: 'approved', minRenterAge: 21, found: true });

    await wheelbaseInsuranceService.link('traverse', 504501);
    expect((await VehicleModel.findById('traverse').lean())!.wheelbase).toMatchObject({ rentalId: 504501, linkedBy: 'admin', minRenterAge: 25 });

    // One listing can only cover one car.
    await expect(wheelbaseInsuranceService.link('buick', 504501)).rejects.toMatchObject({ code: 'WHEELBASE_ALREADY_LINKED' });
  });

  it('keeps the last reading when a listing disappears, and a Wheelbase outage changes nothing', async () => {
    listings.mockResolvedValue(WB);
    await car('buick', 2024, 'Buick', 'Envista');
    await wheelbaseInsuranceService.sync();

    listings.mockResolvedValue([]);
    await wheelbaseInsuranceService.sync();
    expect((await VehicleModel.findById('buick').lean())!.wheelbase).toMatchObject({ insuranceState: 'approved', found: false });

    listings.mockRejectedValue(new Error('down'));
    await expect(wheelbaseInsuranceService.sync()).rejects.toThrow('down');
    expect((await VehicleModel.findById('buick').lean())!.wheelbase).toMatchObject({ insuranceState: 'approved' });
  });
});

describe('insurance rules at booking', () => {
  const pickup = new Date('2026-10-10T15:00:00Z');
  const insured = (minRenterAge: number, insuranceState = 'approved') =>
    VehicleModel.collection.insertOne({
      _id: 'car' as never, status: 'listed', deletedAt: null,
      wheelbase: { rentalId: 1, name: 'Car', linkedBy: 'admin', insuranceState, minRenterAge, found: true, syncedAt: new Date() },
    });
  const guest = (dob: string, verifiedDob?: string) =>
    Promise.all([
      UserModel.collection.insertOne({ _id: 'g' as never, email: 'g@x.com', dateOfBirth: dob }),
      verifiedDob ? KycModel.collection.insertOne({ userId: 'g', status: 'approved', verifiedDob: new Date(verifiedDob) } as never) : null,
    ]);

  it('refuses a driver younger than the car’s minimum, judged at pickup', async () => {
    await insured(25);
    await guest('2002-01-01'); // 24 at pickup
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).rejects.toMatchObject({ code: 'RENTER_TOO_YOUNG' });
  });

  it('prefers the verified ID’s date of birth over the profile', async () => {
    await insured(21);
    await guest('1990-01-01', '2008-01-01'); // profile says 36, ID says 18
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).rejects.toMatchObject({ code: 'RENTER_TOO_YOUNG' });
  });

  it('passes an old-enough driver on an approved car', async () => {
    await insured(21);
    await guest('1990-01-01');
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).resolves.toBeUndefined();
  });

  it('refuses a car that is not approved, or not linked at all', async () => {
    await insured(21, 'pending');
    await guest('1990-01-01');
    await expect(wheelbaseInsuranceService.assertInsurable('car', 'g', pickup)).rejects.toMatchObject({ code: 'INSURANCE_NOT_APPROVED' });
    await expect(wheelbaseInsuranceService.assertInsurable('no-such-car', 'g', pickup)).rejects.toMatchObject({ code: 'INSURANCE_NOT_APPROVED' });
  });
});
