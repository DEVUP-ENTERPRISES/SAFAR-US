import { AssetPartnerModel, type AgreementOffer, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { AssetPartnerAgreementModel } from '../infrastructure/asset-partner-agreement.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, ForbiddenError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const DAY = 24 * 3600_000;
const longDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });

export interface OfferState {
  sentAt: Date;
  expiresAt: Date;
  expired: boolean;
  daysLeft: number;
  reissueRequestedAt?: Date;
}

const unsigned = { agreementRequired: true, status: { $ne: 'exited' }, $or: [{ 'agreement.signedAt': { $exists: false } }, { 'nda.signedAt': { $exists: false } }] };

async function documentsPublished(): Promise<boolean> {
  const [agreement, nda] = await Promise.all([
    AssetPartnerAgreementModel.exists({ kind: { $in: ['agreement', null] } }),
    AssetPartnerAgreementModel.exists({ kind: 'nda' }),
  ]);
  return !!agreement && !!nda;
}

async function validDays(): Promise<number> {
  return (await platformConfigService.get()).assetPartner.agreementValidDays ?? 25;
}

/** The window an approved partner has to sign; it opens once both documents exist and lapses after the configured days. */
export const assetPartnerOfferService = {
  state(partner: Pick<AssetPartnerDoc, 'agreementOffer'>, now = new Date()): OfferState | null {
    const o = partner.agreementOffer;
    if (!o?.expiresAt) return null;
    const expiresAt = new Date(o.expiresAt);
    return {
      sentAt: new Date(o.sentAt),
      expiresAt,
      expired: now >= expiresAt,
      daysLeft: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY)),
      reissueRequestedAt: o.reissueRequestedAt,
    };
  },

  /** Opens the window once; a partner already holding one keeps it. Returns the partner as stored. */
  async open(partner: AssetPartnerDoc, now = new Date()): Promise<AssetPartnerDoc> {
    if (!partner.agreementRequired || partner.agreementOffer?.expiresAt || (partner.agreement?.signedAt && partner.nda?.signedAt)) return partner;
    if (!(await documentsPublished())) return partner;
    const offer: AgreementOffer = { sentAt: now, expiresAt: new Date(now.getTime() + (await validDays()) * DAY), reissues: 0 };
    const doc = await AssetPartnerModel.findOneAndUpdate(
      { _id: partner._id, 'agreementOffer.expiresAt': { $exists: false } },
      { $set: { agreementOffer: offer } },
      { new: true },
    ).lean<AssetPartnerDoc>();
    return doc ?? (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>()) ?? partner;
  },

  /** Signing is refused once the window has passed; the partner asks for a new copy instead. */
  assertSignable(partner: AssetPartnerDoc, now = new Date()): void {
    const s = this.state(partner, now);
    if (s?.expired) {
      throw new ConflictError(`This offer to sign ended on ${longDate(s.expiresAt)}. Ask us for a new copy and we’ll send it.`, 'AGREEMENT_OFFER_EXPIRED');
    }
  },

  /** The partner missed the window and asks CatoDrive to send it again. */
  async requestReissue(partner: AssetPartnerDoc): Promise<OfferState | null> {
    if (!partner.agreementRequired) throw new ForbiddenError('There is no agreement waiting for your signature.');
    const s = this.state(partner);
    if (!s?.expired) throw new ConflictError('Your offer is still open. You can sign it now.', 'AGREEMENT_OFFER_OPEN');
    if (!s.reissueRequestedAt) {
      await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { 'agreementOffer.reissueRequestedAt': new Date() } });
      logger.info({ partnerId: partner._id }, 'Asset Partner asked for a new agreement offer');
    }
    return this.state((await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!);
  },

  /** Ops sends the offer again: a fresh window from today, and the partner is told. */
  async reissue(partnerId: string, by: string, now = new Date()): Promise<OfferState> {
    const partner = await AssetPartnerModel.findById(partnerId).lean<AssetPartnerDoc>();
    if (!partner) throw new ConflictError('Partner not found', 'NOT_FOUND');
    if (!partner.agreementRequired || (partner.agreement?.signedAt && partner.nda?.signedAt)) {
      throw new ConflictError('This partner has already signed.', 'ALREADY_SIGNED');
    }
    if (!(await documentsPublished())) throw new ConflictError('Publish the agreement and NDA first.', 'AGREEMENT_NOT_READY');
    const offer: AgreementOffer = { sentAt: now, expiresAt: new Date(now.getTime() + (await validDays()) * DAY), reissues: (partner.agreementOffer?.reissues ?? 0) + 1 };
    await AssetPartnerModel.updateOne({ _id: partnerId }, { $set: { agreementOffer: offer } });
    logger.info({ partnerId, by, reissues: offer.reissues }, 'Asset Partner agreement offer sent again');
    await notificationService
      .send({
        userId: partner.userId,
        priority: 'high',
        deepLink: '/asset-partners/dashboard',
        templateKey: 'account.asset_partner_offer_reissued',
        title: 'Your partner agreement is ready to sign again',
        body: `Please sign by ${longDate(offer.expiresAt)}. Sign in to your partner portal to read and sign it.`,
        data: { partnerId },
      })
      .catch((err) => logger.warn({ err, partnerId }, 'offer reissue notice failed'));
    return this.state({ agreementOffer: offer }, now)!;
  },

  /** Hourly: open windows that should exist, remind before they end, and tell partners when one ends. */
  async sweep(now = new Date()): Promise<{ opened: number; reminded: number; expired: number }> {
    const cfg = (await platformConfigService.get()).assetPartner;
    const remindDays = cfg.agreementReminderDays ?? 5;
    let opened = 0;
    let reminded = 0;
    let expired = 0;

    if (await documentsPublished()) {
      const missing = await AssetPartnerModel.find({ ...unsigned, 'agreementOffer.expiresAt': { $exists: false } }).limit(200).lean<AssetPartnerDoc[]>();
      for (const p of missing) if ((await this.open(p, now)).agreementOffer) opened += 1;
    }

    if (remindDays > 0) {
      const due = await AssetPartnerModel.find({
        ...unsigned,
        'agreementOffer.expiresAt': { $gt: now, $lte: new Date(now.getTime() + remindDays * DAY) },
        'agreementOffer.remindedAt': { $exists: false },
      }).limit(200).lean<AssetPartnerDoc[]>();
      for (const p of due) {
        const claimed = await AssetPartnerModel.updateOne({ _id: p._id, 'agreementOffer.remindedAt': { $exists: false } }, { $set: { 'agreementOffer.remindedAt': now } });
        if (!claimed.modifiedCount) continue;
        reminded += 1;
        await notificationService
          .send({
            userId: p.userId,
            priority: 'high',
            deepLink: '/asset-partners/dashboard',
            templateKey: 'account.asset_partner_offer_reminder',
            title: 'Please sign your partner agreement',
            body: `Your offer to sign ends on ${longDate(new Date(p.agreementOffer!.expiresAt))}. After that we’ll need to send it again.`,
            data: { partnerId: p._id },
          })
          .catch(() => undefined);
      }
    }

    const lapsed = await AssetPartnerModel.find({ ...unsigned, 'agreementOffer.expiresAt': { $lte: now }, 'agreementOffer.expiredNoticeAt': { $exists: false } }).limit(200).lean<AssetPartnerDoc[]>();
    for (const p of lapsed) {
      const claimed = await AssetPartnerModel.updateOne({ _id: p._id, 'agreementOffer.expiredNoticeAt': { $exists: false } }, { $set: { 'agreementOffer.expiredNoticeAt': now } });
      if (!claimed.modifiedCount) continue;
      expired += 1;
      await notificationService
        .send({
          userId: p.userId,
          priority: 'high',
          deepLink: '/asset-partners/dashboard',
          templateKey: 'account.asset_partner_offer_expired',
          title: 'Your offer to sign has ended',
          body: 'The time to sign your partner agreement has passed. Sign in and ask for a new copy, and we’ll send it to you.',
          data: { partnerId: p._id },
        })
        .catch(() => undefined);
    }
    if (opened || reminded || expired) logger.info({ opened, reminded, expired }, 'Asset Partner agreement offers swept');
    return { opened, reminded, expired };
  },
};
