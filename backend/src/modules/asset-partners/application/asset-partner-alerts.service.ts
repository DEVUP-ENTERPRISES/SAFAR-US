import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { notificationService } from '../../notifications/application/notification.service';
import { assetPartnerStatementService, currentPeriod } from './asset-partner-statement.service';
import { logger } from '../../../infrastructure/logging/logger';

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const LONG_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

async function partnerUserFor(vehicleId: string): Promise<{ userId: string; car: string } | null> {
  const v = await VehicleModel.findById(vehicleId).select('assetPartnerId year make model').lean<{ assetPartnerId?: string; year: number; make: string; model: string }>();
  if (!v?.assetPartnerId) return null;
  const p = await AssetPartnerModel.findById(v.assetPartnerId).select('userId').lean<{ userId: string }>();
  return p ? { userId: p.userId, car: `${v.year} ${v.make} ${v.model}` } : null;
}

/** Messages an Asset Partner needs because the car is theirs, even though CatoDrive's team runs it. */
export const assetPartnerAlertsService = {
  /** The first time a partner's car is listed, its owner hears it is earning; later relists stay quiet. */
  async carLive(vehicleId: string): Promise<void> {
    const claimed = await VehicleModel.updateOne({ _id: vehicleId, assetPartnerId: { $exists: true, $ne: null }, partnerLiveNotifiedAt: null }, { $set: { partnerLiveNotifiedAt: new Date() } });
    if (!claimed.modifiedCount) return;
    const who = await partnerUserFor(vehicleId);
    if (!who) return;
    await notificationService
      .send({ userId: who.userId, priority: 'high', templateKey: 'account.asset_partner_car_live', title: `Your ${who.car} is live`, body: 'Guests can book it now. Your earnings show on your dashboard as trips complete.', deepLink: `/vehicles/${vehicleId}`, data: { vehicleId } })
      .catch((err) => logger.warn({ err: (err as Error).message, vehicleId }, 'car live message failed'));
  },

  /** The partner owns the car, so a registration or insurance about to lapse is theirs to renew. */
  async documentExpiring(vehicleId: string, category: string, expiresAt: Date | undefined, days: number): Promise<void> {
    const who = await partnerUserFor(vehicleId);
    if (!who) return;
    const when = expiresAt ? LONG_DATE.format(new Date(expiresAt)) : 'soon';
    await notificationService.send({
      userId: who.userId,
      priority: days <= 7 ? 'high' : 'normal',
      templateKey: 'account.asset_partner_document_expiring',
      title: `${who.car}: ${category} expires ${when}`,
      body: `Upload the renewed ${category} in your partner portal before ${when}, or the car has to stop taking bookings until it’s renewed.`,
      deepLink: '/documents',
      data: { vehicleId, category, days },
    });
  },

  /** Once a month closes, each partner hears their final net and when it will be paid. Safe to run every hour. */
  async statementsReady(now = new Date()): Promise<number> {
    const period = currentPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    const partners = await AssetPartnerModel.find({ status: { $in: ['active', 'onboarding'] }, statementNotifiedFor: { $ne: period } }).lean<AssetPartnerDoc[]>();
    let sent = 0;
    for (const p of partners) {
      try {
        const s = await assetPartnerStatementService.statement(p, period);
        // Claimed before sending so two servers never both send it.
        const claimed = await AssetPartnerModel.updateOne({ _id: p._id, statementNotifiedFor: { $ne: period } }, { $set: { statementNotifiedFor: period } });
        if (!claimed.modifiedCount || s.lines.length === 0) continue;
        await notificationService.send({
          userId: p.userId,
          templateKey: 'account.asset_partner_statement_ready',
          title: `Your ${MONTH.format(new Date(`${period}-01T00:00:00Z`))} statement: ${usd(Math.max(0, s.totals.net))}`,
          body: s.totals.net > 0 ? `${s.totals.trips} completed trip${s.totals.trips === 1 ? '' : 's'}. Paid on ${LONG_DATE.format(s.payoutDate)}.` : 'This month’s costs were more than its earnings, so there’s no payout. The full breakdown is on your statement.',
          deepLink: '/statements',
          data: { period },
        });
        sent += 1;
      } catch (err) {
        logger.warn({ partnerId: p._id, period, err: (err as Error).message }, 'statement ready message failed');
      }
    }
    return sent;
  },
};
