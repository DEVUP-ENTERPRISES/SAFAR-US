import { Router } from 'express';
import { z } from 'zod';
import { MaintenanceModel } from '../infrastructure/maintenance.model';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { hostService } from '../../hosts/application/host.service';
import { asyncHandler } from '../../../shared/middleware/async-handler';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { sendCreated, sendSuccess } from '../../../shared/http/api-response';
import { ConflictError, NotFoundError } from '../../../core/errors/app-error';
import { assetPartnerMaintenanceService } from '../../asset-partners/application/asset-partner-maintenance.service';

const router = Router();

const createSchema = z.object({
  vehicleId: z.string(),
  type: z.enum(['service', 'repair', 'inspection', 'cleaning']),
  scheduledFor: z.coerce.date(),
  odometerKm: z.number().int().min(0).optional(),
  cost: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

router.post(
  '/',
  authenticate,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    // Ownership enforced via the vehicle.
    await vehicleService.assertOwnerById(req.principal!.userId, req.body.vehicleId);
    const vehicle = await vehicleService.getById(req.body.vehicleId);
    // A partner's car goes through their approval line, whichever screen scheduled the work.
    if (vehicle.assetPartnerId && !vehicle.assetPartnerEndedAt) {
      const { cost, ...rest } = req.body;
      sendCreated(res, await assetPartnerMaintenanceService.create({ ...rest, costCents: cost }));
      return;
    }
    const host = await hostService.requireHostForUser(req.principal!.userId);
    const rec = await MaintenanceModel.create({ hostId: host._id, ...req.body });
    sendCreated(res, rec.toObject());
  }),
);

router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const host = await hostService.requireHostForUser(req.principal!.userId);
    const filter: Record<string, unknown> = { hostId: host._id };
    if (req.query.vehicleId) filter.vehicleId = req.query.vehicleId;
    const list = await MaintenanceModel.find(filter).sort({ scheduledFor: -1 }).lean();
    sendSuccess(res, list);
  }),
);

router.post(
  '/:id/complete',
  authenticate,
  asyncHandler(async (req, res) => {
    // Scope to the caller's own host — otherwise any user could complete another
    // host's maintenance record by id.
    const host = await hostService.requireHostForUser(req.principal!.userId);
    const rec = await MaintenanceModel.findOne({ _id: req.params.id, hostId: host._id }).select('approval').lean<{ approval?: string }>();
    if (!rec) throw new NotFoundError('Maintenance record');
    if (rec.approval === 'pending') throw new ConflictError('The car’s owner hasn’t approved this work yet.', 'AWAITING_APPROVAL');
    if (rec.approval === 'declined') throw new ConflictError('The car’s owner declined this work.', 'DECLINED');
    await MaintenanceModel.updateOne({ _id: req.params.id, hostId: host._id }, { status: 'completed' });
    sendSuccess(res, { completed: true });
  }),
);

export const maintenanceRoutes = router;
