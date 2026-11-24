import { userRepository } from '../infrastructure/user.repository';
import { UserModel } from '../infrastructure/user.model';
import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { bookingService } from '../../bookings/application/booking.service';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { DeviceModel } from '../../risk/infrastructure/risk.models';
import { riskService } from '../../risk/application/risk.service';
import { notificationService } from '../../notifications/application/notification.service';
import { notifyHouseFleet } from '../../notifications/application/notify-house-fleet';
import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

export type AccountAction = 'active' | 'restricted' | 'under_review' | 'suspended' | 'banned';

const NOT_STARTED = ['pending_verification', 'pending_payment', 'pending_approval', 'confirmed', 'paid'];

export interface ActionResult {
  status: AccountAction;
  cancelledBookings: string[];
  flaggedBookings: string[];
  inProgress: string[];
  carsUnlisted: number;
  identityBlocked: string[];
}

const USER_COPY: Partial<Record<AccountAction, { title: string; body: string }>> = {
  restricted: { title: 'Your CatoDrive account is limited', body: 'Some features are paused on your account while we look into something. Contact support if you have questions.' },
  under_review: { title: 'Your CatoDrive account is under review', body: 'We’re reviewing your account. You can still sign in, but new bookings are paused until we finish, usually within a day.' },
  suspended: { title: 'Your CatoDrive account is suspended', body: 'Your account is suspended for a safety or policy reason, so you can’t book or hand over cars. Contact support if you think this is a mistake.' },
  banned: { title: 'Your CatoDrive account has been closed', body: 'Your account was closed for a serious safety or policy violation, and upcoming bookings were cancelled with a full refund. Contact support if you think this is a mistake.' },
  active: { title: 'Your CatoDrive account is active again', body: 'Your account is back to normal. Thanks for your patience.' },
};

// The one path every account restriction goes through, so the record, the bookings, the cars and the deny list always agree.
export const accountActionService = {
  async apply(userId: string, status: AccountAction, reason: string, by: string, opts: { blockIdentity?: boolean } = {}): Promise<ActionResult> {
    if (reason.trim().length < 5) throw new ValidationError('Give a reason of at least 5 characters.');
    const user = await UserModel.findById(userId).select('email phone status roles').lean<{ _id: string; email: string; phone?: string; status: string; roles?: string[] }>();
    if (!user) throw new NotFoundError('User');
    if ((user.roles ?? []).includes('super_admin')) throw new ValidationError('The main admin account cannot be restricted.');

    await userRepository.setStatus(userId, status, { reason: reason.trim(), by });
    const result: ActionResult = { status, cancelledBookings: [], flaggedBookings: [], inProgress: [], carsUnlisted: 0, identityBlocked: [] };
    const removing = status === 'suspended' || status === 'banned';

    if (removing) {
      const asGuest = await BookingModel.find({ guestId: userId, status: { $in: NOT_STARTED } }).select('_id code status period').lean<BookingDoc[]>();
      for (const b of asGuest) {
        if (status === 'banned') {
          try {
            await bookingService.adminCancel(by, b._id, `Account closed: ${reason}`);
            result.cancelledBookings.push(b.code);
          } catch (err) {
            logger.warn({ err: (err as Error).message, bookingId: b._id }, 'ban: booking could not be cancelled');
            result.flaggedBookings.push(b.code);
          }
        } else {
          result.flaggedBookings.push(b.code);
        }
      }
      result.inProgress = (await BookingModel.find({ guestId: userId, status: 'in_progress' }).select('code').lean<{ code: string }[]>()).map((b) => b.code);

      const host = await HostModel.findOne({ userId }).select('_id').lean<{ _id: string }>();
      if (host) {
        const cars = await VehicleModel.find({ hostId: host._id, status: 'listed', assetPartnerId: null }).select('_id').lean<{ _id: string }[]>();
        for (const c of cars) {
          await vehicleService.adminSetStatus(c._id, 'suspend').catch((err) => logger.warn({ err: (err as Error).message, vehicleId: c._id }, 'could not unlist car'));
        }
        result.carsUnlisted = cars.length;
        const hostBookings = await BookingModel.find({ hostId: host._id, status: { $in: NOT_STARTED } }).select('code').lean<{ code: string }[]>();
        result.flaggedBookings.push(...hostBookings.map((b) => b.code));
      }
    }

    if (status === 'banned' && opts.blockIdentity) {
      const why = `Banned: ${reason}`.slice(0, 500);
      await riskService.deny('email', user.email, why, by);
      result.identityBlocked.push('email');
      if (user.phone) {
        await riskService.deny('phone', user.phone, why, by);
        result.identityBlocked.push('phone');
      }
      const kyc = await KycModel.findOne({ userId, licenceNumberHash: { $exists: true } }).sort({ createdAt: -1 }).select('licenceNumberHash').lean<{ licenceNumberHash?: string }>();
      if (kyc?.licenceNumberHash) {
        await riskService.denyLicenceHash(kyc.licenceNumberHash, why, by);
        result.identityBlocked.push('licence');
      }
      const devices = await DeviceModel.updateMany({ userIds: userId }, { $set: { blocked: true, blockedReason: why } });
      if (devices.modifiedCount) result.identityBlocked.push(`${devices.modifiedCount} device${devices.modifiedCount === 1 ? '' : 's'}`);
    }

    const copy = USER_COPY[status];
    if (copy && user.status !== status) {
      void notificationService.send({ userId, priority: 'high', templateKey: `account.${status}`, title: copy.title, body: copy.body }).catch(() => undefined);
    }
    if (removing && (result.flaggedBookings.length || result.inProgress.length || result.cancelledBookings.length)) {
      void notifyHouseFleet({
        templateKey: 'ops.account_removed',
        title: `Account ${status}: bookings need a look`,
        body: [
          `Reason: ${reason}`,
          result.cancelledBookings.length ? `Cancelled with full refund: ${result.cancelledBookings.join(', ')}` : '',
          result.flaggedBookings.length ? `Check these upcoming bookings: ${result.flaggedBookings.join(', ')}` : '',
          result.inProgress.length ? `Trips in progress (car still out): ${result.inProgress.join(', ')}` : '',
          result.carsUnlisted ? `${result.carsUnlisted} listed car(s) unlisted.` : '',
        ].filter(Boolean).join('\n'),
      }).catch(() => undefined);
    }
    logger.info({ userId, by, ...result }, 'account action applied');
    return result;
  },
};
