jest.mock('../../notifications/infrastructure/channel.providers', () => ({ channelProviders: { email: { send: jest.fn(async () => ({ ok: true })) } } }));
jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { ticketService } from '../../support/application/ticket.service';
import { assetPartnerHelpService, PARTNER_HELP_CATEGORY } from './asset-partner-help.service';
import { assetPartnerApplicationService } from './asset-partner-application.service';
import { alertLeadership } from './asset-partner-leadership-alert';
import { UserModel } from '../../users/infrastructure/user.model';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { notificationService } from '../../notifications/application/notification.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const emailSend = channelProviders.email.send as jest.Mock;
const notify = notificationService.send as jest.Mock;
const flush = () => new Promise((r) => setTimeout(r, 50));

describe('partner help', () => {
  it('a partner message reaches the partner team, who reply and mark it done', async () => {
    const partner = await UserModel.create({ email: 'jordan@example.com', firstName: 'Jordan', roles: ['guest'] });
    const ops = await UserModel.create({ email: 'ops@catodrive.test', roles: ['host', 'house_fleet'], status: 'active' });
    const t = await ticketService.create(String(partner._id), { subject: 'Partner question', body: 'When is my inspection?', category: PARTNER_HELP_CATEGORY });
    await flush();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: String(ops._id), title: 'New partner chat' }));

    const open = await assetPartnerHelpService.list({ open: true });
    expect(open.total).toBe(1);
    expect(open.items[0]).toMatchObject({ _id: t._id, lastMessage: { body: 'When is my inspection?', fromPartner: true } });

    const thread = await assetPartnerHelpService.reply(String(ops._id), t._id, 'Thursday at 10 AM.');
    expect(thread.messages.map((m) => m.body)).toEqual(['When is my inspection?', 'Thursday at 10 AM.']);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: String(partner._id), templateKey: 'support.reply' }));

    await assetPartnerHelpService.resolve(t._id);
    expect((await assetPartnerHelpService.list({ open: true })).total).toBe(0);
    expect((await assetPartnerHelpService.list({ open: false })).total).toBe(1);
  });

  it('keeps guest support tickets out of the partner inbox', async () => {
    const guest = await UserModel.create({ email: 'guest@example.com', roles: ['guest'] });
    const t = await ticketService.create(String(guest._id), { subject: 'Booking help', body: 'Where is my car?' });
    expect((await assetPartnerHelpService.list({ open: true })).total).toBe(0);
    await expect(assetPartnerHelpService.get(t._id)).rejects.toThrow();
  });
});

describe('leadership alerts', () => {
  it('emails the leadership list when a partner applies', async () => {
    const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified: true });
    const dto = {
      fullName: 'Jordan Ramirez', partnerType: 'individual', phone: '2145550142', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
      vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC-1234' },
      ownership: 'owned', titleStatus: 'clean',
      photos: [{ url: 'https://files.example/f.jpg', label: 'Front' }, { url: 'https://files.example/r.jpg', label: 'Rear' }, { url: 'https://files.example/o.jpg', label: 'Odometer' }],
      accident: 'no', availability: 'fulltime', acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true,
      signature: 'Jordan Ramirez', signDate: new Date(),
    } as PortalApplicationDto;
    await assetPartnerApplicationService.createForAccount(String(user._id), dto, {});
    await flush();
    const to = emailSend.mock.calls.map(([req]) => req.target.email).sort();
    expect(to).toEqual(['ceo@catodrive.com', 'cmo@catodrive.com']);
    expect(emailSend.mock.calls[0][0].title).toBe('New Asset Partner application: Jordan Ramirez');
  });

  it('never throws when the email provider fails', async () => {
    emailSend.mockRejectedValueOnce(new Error('smtp down'));
    await expect(alertLeadership('Test', ['line'])).resolves.toBeUndefined();
  });
});
