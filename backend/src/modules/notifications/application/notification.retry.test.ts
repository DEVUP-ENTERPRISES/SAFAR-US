const emailSend = jest.fn();
jest.mock('../infrastructure/channel.providers', () => ({
  channelProviders: { email: { send: (...a: unknown[]) => emailSend(...a) }, sms: { send: jest.fn() }, push: { send: jest.fn() } },
}));

import { notificationService } from './notification.service';
import { NotificationModel } from '../infrastructure/notification.model';
import { userRepository } from '../../users/infrastructure/user.repository';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  emailSend.mockReset();
});

const facts = [{ label: 'Car', value: 'Buick Encore 2021' }];

async function failedEmail(minutesAgo: number, retryable: boolean, priority: 'critical' | 'normal' = 'critical') {
  const u = await userRepository.create({ email: `guest${Math.random().toString(36).slice(2)}@x.com`, firstName: 'G' } as never);
  const at = new Date(Date.now() - minutesAgo * 60_000);
  return NotificationModel.create({
    userId: u._id, channel: 'inapp', priority, templateKey: 'booking.confirmed', title: 'Booking confirmed', body: 'Booked',
    deepLink: '/bookings/b1', actionLabel: 'View booking', facts, status: 'sent',
    attempts: [{ channel: 'email', at, ok: false, error: 'smtp 421', retryable }],
  });
}

describe('failed notifications are retried', () => {
  it('re-sends a passing email failure once its wait is up, with the same details', async () => {
    emailSend.mockResolvedValue({ ok: true, providerId: 'm1' });
    const n = await failedEmail(6, true);

    expect(await notificationService.retryFailed()).toBe(1);
    expect(emailSend).toHaveBeenCalledWith(expect.objectContaining({ title: 'Booking confirmed', actionLabel: 'View booking', facts }));
    const after = await NotificationModel.findById(n._id).lean();
    expect(after!.attempts!.at(-1)).toMatchObject({ channel: 'email', ok: true });

    // Delivered now, so a later run leaves it alone.
    expect(await notificationService.retryFailed()).toBe(0);
  });

  it('waits out the back-off and never retries a permanent failure', async () => {
    await failedEmail(2, true);
    await failedEmail(30, false);
    expect(await notificationService.retryFailed()).toBe(0);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('stops once the schedule is used up', async () => {
    emailSend.mockResolvedValue({ ok: false, error: 'smtp 421', retryable: true });
    // Normal priority gets a single retry.
    const n = await failedEmail(20, true, 'normal');
    expect(await notificationService.retryFailed()).toBe(1);
    await NotificationModel.updateOne({ _id: n._id }, { $set: { 'attempts.1.at': new Date(Date.now() - 3_600_000) } });
    expect(await notificationService.retryFailed()).toBe(0);
  });
});
