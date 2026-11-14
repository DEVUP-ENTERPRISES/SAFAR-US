import { assetPartnerReportsService } from './asset-partner-reports.service';
import { assetPartnerService } from './asset-partner.service';
import { AssetPartnerModel } from '../infrastructure/asset-partner.model';
import { AssetPartnerPayoutModel } from '../infrastructure/asset-partner-payout.model';
import { AssetPartnerApplicationModel } from '../infrastructure/asset-partner-application.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const pay = (partnerId: string, period: string, amount: number, paidAt: string) =>
  AssetPartnerPayoutModel.create({ partnerId, period, amount, method: 'zelle', reference: `Z-${period}`, paidAt: new Date(paidAt), recordedBy: 'ops' });

describe('1099 tax file', () => {
  it('totals what was paid in the calendar year, not what was earned in it', async () => {
    const a = await assetPartnerService.enrol({ userId: 'u-a', hostId: 'h', partnerType: 'individual', displayName: 'Jordan Ramirez' });
    const b = await assetPartnerService.enrol({ userId: 'u-b', hostId: 'h', partnerType: 'business', displayName: 'Lone Star Cars', businessName: 'Lone Star Cars LLC' });
    await AssetPartnerApplicationModel.collection.insertOne({ _id: 'app-a', fullName: 'Jordan A. Ramirez', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201' } as never);
    await AssetPartnerModel.updateOne({ _id: a._id }, { applicationId: 'app-a', email: 'jordan@example.com' });

    await pay(a._id, '2025-12', 90_000, '2026-01-05T15:00:00Z');
    await pay(a._id, '2026-01', 160_000, '2026-02-05T15:00:00Z');
    await pay(a._id, '2026-12', 50_000, '2027-01-05T15:00:00Z');
    await pay(b._id, '2026-03', 120_000, '2026-04-05T15:00:00Z');

    const r = await assetPartnerReportsService.taxYear(2026);
    expect(r.thresholdCents).toBe(200_000);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ name: 'Jordan Ramirez', legalName: 'Jordan A. Ramirez', street: '1 Main St', zip: '75201', payouts: 2, paidCents: 250_000, needs1099: true });
    expect(r.rows[1]).toMatchObject({ name: 'Lone Star Cars', businessName: 'Lone Star Cars LLC', paidCents: 120_000, needs1099: false });
  });

  it('uses the 1099 amount set in admin and writes a spreadsheet', async () => {
    const a = await assetPartnerService.enrol({ userId: 'u-a', hostId: 'h', partnerType: 'individual', displayName: '=Ramirez' });
    await pay(a._id, '2026-01', 100_000, '2026-02-05T15:00:00Z');
    const cfg = await platformConfigService.get();
    await platformConfigService.update({ assetPartner: { ...cfg.assetPartner, form1099ThresholdCents: 60_000 } } as never, 'test');

    const { csv, filename } = await assetPartnerReportsService.taxYearCsv(2026);
    expect(filename).toBe('catodrive-partner-1099-2026.csv');
    const [head, row] = csv.replace('﻿', '').trim().split('\r\n');
    expect(head).toContain('Paid in 2026 (USD),Needs a 1099');
    expect(row.startsWith("'=Ramirez,")).toBe(true);
    expect(row.endsWith('1000.00,Yes')).toBe(true);
  });

  it('refuses a year that has not started', async () => {
    await expect(assetPartnerReportsService.taxYear(new Date().getUTCFullYear() + 1)).rejects.toThrow('started');
  });
});
