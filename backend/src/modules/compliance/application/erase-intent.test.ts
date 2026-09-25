jest.mock('../../notifications/infrastructure/channel.providers', () => ({
  channelProviders: { email: { send: jest.fn().mockResolvedValue({ ok: true }) }, sms: { send: jest.fn() } },
}));

import { UnauthorizedError } from '../../../core/errors/app-error';
import { dataRightsService } from './data-rights.service';
import { hashPassword } from '../../auth/application/password';
import { userRepository } from '../../users/infrastructure/user.repository';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('account erasure needs proof', () => {
  it('refuses a missing or wrong password and accepts the right one', async () => {
    const u = await userRepository.create({ email: 'a@x.com', passwordHash: await hashPassword('Correct-horse-9'), firstName: 'A' } as never);

    await expect(dataRightsService.assertErasureIntent(u._id, {})).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(dataRightsService.assertErasureIntent(u._id, { password: 'nope' })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(dataRightsService.assertErasureIntent(u._id, { password: 'Correct-horse-9' })).resolves.toBeUndefined();
  });

  it('makes a passwordless account confirm with an emailed code', async () => {
    const u = await userRepository.create({ email: 'b@x.com', firstName: 'B' } as never);

    await expect(dataRightsService.assertErasureIntent(u._id, {})).rejects.toBeInstanceOf(UnauthorizedError);
    const { devCode } = await dataRightsService.requestErasureCode(u._id);
    await expect(dataRightsService.assertErasureIntent(u._id, { code: devCode })).resolves.toBeUndefined();
  });
});
