/**
 * Maintenance approval for Asset Partner vehicles.
 *
 * The published agreement: routine maintenance under $500 proceeds without
 * interrupting the partner; anything above needs their yes/no first. This
 * pins that gate, and that a partner can never act on someone else's request.
 */
import { assetPartnerMaintenanceService } from './asset-partner-maintenance.service';
import { assetPartnerService } from './asset-partner.service';
import { MaintenanceModel } from '../../maintenance/infrastructure/maintenance.model';
import { NotificationModel } from '../../notifications/infrastructure/notification.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function enrolPartner(userId = 'user-1', hostId = 'host-1') {
  return assetPartnerService.enrol({ userId, hostId, partnerType: 'individual', displayName: 'Jordan Ramirez' });
}

async function addVehicle(partnerId: string, id: string, hostId = 'host-1') {
  await VehicleModel.create({
    _id: id,
    hostId,
    assetPartnerId: partnerId,
    year: 2024,
    make: 'VW',
    model: 'Atlas',
    category: 'suv',
    status: 'listed',
    seats: 7,
    fuelType: 'petrol',
    transmission: 'automatic',
    bodyType: 'suv',
    listing: { title: 'VW Atlas' },
    pricing: { dailyPrice: 9500, currency: 'USD' },
    location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
  });
}

describe('asset partner maintenance approval', () => {
  it('does not require approval under the threshold ($500 default)', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');

    const rec = await assetPartnerMaintenanceService.create({
      vehicleId: 'veh-1',
      type: 'service',
      scheduledFor: new Date(),
      costCents: 30_000, // $300
    });
    expect(rec.approval).toBe('not_required');
  });

  it('requires approval over the threshold and notifies the partner', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');

    const rec = await assetPartnerMaintenanceService.create({
      vehicleId: 'veh-1',
      type: 'repair',
      scheduledFor: new Date(),
      costCents: 90_000, // $900
    });
    expect(rec.approval).toBe('pending');
    expect(rec.approvalThresholdCents).toBe(50_000);

    const notif = await NotificationModel.findOne({ userId: partner.userId }).lean();
    expect(notif).toBeTruthy();
    expect(notif!.templateKey).toBe('asset_partner.maintenance_approval');
  });

  it('refuses to schedule maintenance on a vehicle that is not partner-managed', async () => {
    await VehicleModel.create({
      _id: 'veh-host-only',
      hostId: 'host-2',
      year: 2024,
      make: 'Honda',
      model: 'CR-V',
      category: 'suv',
      status: 'listed',
      seats: 5,
      fuelType: 'petrol',
      transmission: 'automatic',
      bodyType: 'suv',
      listing: { title: 'CR-V' },
      pricing: { dailyPrice: 8000, currency: 'USD' },
      location: { city: 'Dallas', state: 'TX', type: 'Point', coordinates: [-96.8, 32.78] },
    });
    await expect(
      assetPartnerMaintenanceService.create({
        vehicleId: 'veh-host-only',
        type: 'service',
        scheduledFor: new Date(),
        costCents: 90_000,
      }),
    ).rejects.toThrow();
  });

  it('honours a negotiated approval threshold over the platform default', async () => {
    const partner = await enrolPartner();
    await assetPartnerService.setTerms(partner._id, { maintenanceApprovalCents: 20_000 }); // $200
    await addVehicle(partner._id, 'veh-1');

    const rec = await assetPartnerMaintenanceService.create({
      vehicleId: 'veh-1',
      type: 'service',
      scheduledFor: new Date(),
      costCents: 25_000, // $250 — under platform default, over this partner's
    });
    expect(rec.approval).toBe('pending');
  });

  it('lets the partner approve their own pending request', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    const rec = await assetPartnerMaintenanceService.create({
      vehicleId: 'veh-1',
      type: 'repair',
      scheduledFor: new Date(),
      costCents: 90_000,
    });

    const approved = await assetPartnerMaintenanceService.approve(partner.userId, rec._id);
    expect(approved.approval).toBe('approved');
    expect(approved.approvedBy).toBe(partner.userId);
  });

  it('lets the partner decline with a reason', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    const rec = await assetPartnerMaintenanceService.create({
      vehicleId: 'veh-1',
      type: 'repair',
      scheduledFor: new Date(),
      costCents: 90_000,
    });

    const declined = await assetPartnerMaintenanceService.decline(partner.userId, rec._id, 'Too expensive');
    expect(declined.approval).toBe('declined');
    expect(declined.declineReason).toBe('Too expensive');
  });

  it('refuses to re-decide an already-decided request', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    const rec = await assetPartnerMaintenanceService.create({
      vehicleId: 'veh-1',
      type: 'repair',
      scheduledFor: new Date(),
      costCents: 90_000,
    });
    await assetPartnerMaintenanceService.approve(partner.userId, rec._id);
    await expect(assetPartnerMaintenanceService.decline(partner.userId, rec._id)).rejects.toThrow();
  });

  // The most important guarantee: one partner cannot act on another
  // partner's maintenance request just by knowing (or guessing) its id.
  it('refuses to let a different partner approve someone else’s request', async () => {
    const owner = await enrolPartner('user-owner', 'host-owner');
    const stranger = await enrolPartner('user-stranger', 'host-stranger');
    await addVehicle(owner._id, 'veh-1', 'host-owner');
    const rec = await assetPartnerMaintenanceService.create({
      vehicleId: 'veh-1',
      type: 'repair',
      scheduledFor: new Date(),
      costCents: 90_000,
    });

    await expect(assetPartnerMaintenanceService.approve(stranger.userId, rec._id)).rejects.toThrow();
    const stillPending = await MaintenanceModel.findById(rec._id).lean();
    expect(stillPending!.approval).toBe('pending');
  });

  it('lists only what belongs to the calling partner, filterable by approval state', async () => {
    const partner = await enrolPartner();
    await addVehicle(partner._id, 'veh-1');
    await assetPartnerMaintenanceService.create({ vehicleId: 'veh-1', type: 'cleaning', scheduledFor: new Date(), costCents: 5_000 });
    await assetPartnerMaintenanceService.create({ vehicleId: 'veh-1', type: 'repair', scheduledFor: new Date(), costCents: 90_000 });

    const all = await assetPartnerMaintenanceService.listForPartner(partner);
    expect(all).toHaveLength(2);
    const pending = await assetPartnerMaintenanceService.listForPartner(partner, { approval: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0].approval).toBe('pending');
  });
});
