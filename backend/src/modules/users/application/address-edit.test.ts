import { userService } from './user.service';
import { UserModel } from '../infrastructure/user.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('saved addresses', () => {
  it('a new address can become the main one, and an address can be edited in place', async () => {
    const u = await UserModel.create({ email: 'a@x.com', roles: ['guest'] });
    await userService.addAddress(u._id, { line1: '1 Old St', city: 'Dallas', state: 'TX', zip: '75001', country: 'US' });
    const after = await userService.addAddress(u._id, { line1: '9 New Ave', line2: 'Apt 4B', city: 'Irving', state: 'TX', zip: '75038', country: 'US', isDefault: true });
    expect(after.addresses.find((a) => a.isDefault)?.line1).toBe('9 New Ave');
    expect(after.addresses[0].label).toBe('Home');
    expect(after.addresses[1].label).toBe('Address');

    const oldId = after.addresses[0].id;
    const edited = await userService.updateAddress(u._id, oldId, { line1: '2 Fixed Rd', line2: '  ', isDefault: true });
    const row = edited.addresses.find((a) => a.id === oldId)!;
    expect(row.line1).toBe('2 Fixed Rd');
    expect(row.line2).toBeUndefined();
    expect(edited.addresses.filter((a) => a.isDefault)).toHaveLength(1);
    expect(edited.addresses.find((a) => a.isDefault)?.id).toBe(oldId);
  });

  it('refuses to edit an address that is not yours', async () => {
    const u = await UserModel.create({ email: 'b@x.com', roles: ['guest'] });
    await expect(userService.updateAddress(u._id, 'nope', { line1: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
