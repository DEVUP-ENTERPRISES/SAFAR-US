import { createHash } from 'node:crypto';
import { AssetPartnerAgreementModel, type AssetPartnerAgreementDoc } from '../infrastructure/asset-partner-agreement.model';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { ConflictError, ForbiddenError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const hashOf = (body: string) => createHash('sha256').update(body, 'utf8').digest('hex');

export class AssetPartnerAgreementService {
  async current(): Promise<AssetPartnerAgreementDoc | null> {
    return AssetPartnerAgreementModel.findOne().sort({ version: -1 }).lean<AssetPartnerAgreementDoc>().exec();
  }

  async versions(limit = 20): Promise<AssetPartnerAgreementDoc[]> {
    return AssetPartnerAgreementModel.find().sort({ version: -1 }).limit(limit).lean<AssetPartnerAgreementDoc[]>().exec();
  }

  async publish(userId: string, input: { title: string; body: string }): Promise<AssetPartnerAgreementDoc> {
    const latest = await this.current();
    const bodyHash = hashOf(input.body);
    if (latest && latest.bodyHash === bodyHash && latest.title === input.title) return latest;
    try {
      const doc = await AssetPartnerAgreementModel.create({ version: (latest?.version ?? 0) + 1, title: input.title, body: input.body, bodyHash, publishedBy: userId });
      logger.info({ version: doc.version }, 'Asset Partner agreement published');
      return doc.toObject();
    } catch (err) {
      // Two people publishing at once collide on the unique version.
      if ((err as { code?: number }).code === 11000) throw new ConflictError('Someone else just published a version. Reload and try again.', 'AGREEMENT_VERSION_TAKEN');
      throw err;
    }
  }

  /** Records the partner's signature on the version they read; a stale page cannot sign an older text. */
  async sign(partner: AssetPartnerDoc, input: { version: number; signedName: string }, ctx: { ip?: string; userAgent?: string }): Promise<AssetPartnerDoc> {
    if (!partner.agreementRequired) throw new ForbiddenError('There is no agreement waiting for your signature.');
    if (partner.agreement?.signedAt) return partner;
    const latest = await this.current();
    if (!latest) throw new ConflictError('Your agreement is still being prepared. We’ll email you when it’s ready.', 'AGREEMENT_NOT_READY');
    if (latest.version !== input.version) throw new ConflictError('The agreement was updated. Please read the latest version and sign again.', 'AGREEMENT_OUTDATED');
    const signedName = input.signedName.trim().replace(/\s+/g, ' ');
    if (signedName.length < 2) throw new ValidationError('Type your full legal name to sign');

    const signature = { version: latest.version, bodyHash: latest.bodyHash, signedName, signedAt: new Date(), ip: ctx.ip, userAgent: ctx.userAgent };
    const doc = await AssetPartnerModel.findOneAndUpdate(
      { _id: partner._id, 'agreement.signedAt': { $exists: false } },
      { $set: { agreement: signature } },
      { new: true },
    ).lean<AssetPartnerDoc>();
    logger.info({ partnerId: partner._id, version: latest.version }, 'Asset Partner agreement signed');
    return doc ?? (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!;
  }
}

export const assetPartnerAgreementService = new AssetPartnerAgreementService();
