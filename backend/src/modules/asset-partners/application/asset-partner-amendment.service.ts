import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import type { AssetPartnerTermsVersionDoc } from '../infrastructure/asset-partner-terms.model';
import { assetPartnerTermsService, type TermsPatch } from './asset-partner-terms.service';
import { assetPartnerEnvelopeService, type Ctx } from './asset-partner-envelope.service';
import { assetPartnerAgreementService, changesTable, renderAgreement, termFields } from './asset-partner-agreement.service';
import { assetPartnerService } from './asset-partner.service';
import { notificationService } from '../../notifications/application/notification.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { logger } from '../../../infrastructure/logging/logger';

// Used until CatoDrive publishes its own rate-change text in the operations panel; the change list is always generated.
const DEFAULT_TITLE = 'Amendment to the Asset Partner Agreement';
const DEFAULT_BODY = `This amendment is made between {{partner_name}} ("Partner") and CatoDrive under the Asset Partner Agreement the Partner signed.

1. Changes. From {{changes_effective}}, the following terms change:

{{changes_table}}

2. Everything else stays the same. All other terms of the Agreement and the Non-Disclosure Agreement continue unchanged.

3. No backdating. The new terms apply only to trips that end on or after the date above. Trips before it keep the terms in force when they happened.

Signed electronically by {{signed_name}} on {{effective_date}}.`;

const dateText = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

export interface AmendmentView {
  versionId: string;
  title: string;
  version: number;
  body: string;
  from: Record<string, string>;
  to: Record<string, string>;
  requestedFrom: string;
  reason?: string;
}

export class AssetPartnerAmendmentService {
  /** Staff send new terms to a partner who has signed; the partner is told to review and sign. */
  async request(partnerId: string, patch: TermsPatch, opts: { requestedFrom?: Date; reason?: string; actorId: string }): Promise<AssetPartnerTermsVersionDoc> {
    const partner = await assetPartnerService.getById(partnerId);
    const version = await assetPartnerTermsService.requestChange(partner, patch, opts);
    await assetPartnerEnvelopeService.recordEvent(partner._id, 'amendment', 'sent', {}, { termsVersionId: version._id }).catch(() => undefined);
    await notificationService
      .send({
        userId: partner.userId,
        priority: 'high',
        deepLink: '/asset-partners/dashboard',
        templateKey: 'account.asset_partner_terms_change',
        title: 'Please review a change to your terms',
        body: 'CatoDrive has proposed new partner terms. Nothing changes until you review and sign them in your partner portal.',
        data: { versionId: version._id },
      })
      .catch((err) => logger.warn({ err, partnerId }, 'terms change notice failed'));
    return version;
  }

  private async text(partner: AssetPartnerDoc, version: AssetPartnerTermsVersionDoc, signedName = '', signedAt?: Date) {
    const current = await assetPartnerTermsService.at(partner, new Date());
    const template = await assetPartnerAgreementService.current('amendment');
    const effective = new Date(Math.max(new Date(version.requestedFrom).getTime(), (signedAt ?? new Date()).getTime()));
    const fields = {
      ...(await assetPartnerAgreementService.prefill(partner)),
      ...termFields(version.terms),
      changes_table: changesTable(current, version.terms),
      changes_effective: dateText(effective),
      ...(signedName ? { signed_name: signedName } : {}),
      ...(signedAt ? { effective_date: dateText(signedAt) } : {}),
    };
    return {
      title: template?.title ?? DEFAULT_TITLE,
      // 0 marks the built-in text; a published amendment carries its own version number.
      version: template?.version ?? 0,
      body: renderAgreement(template?.body ?? DEFAULT_BODY, fields),
      from: termFields(current),
      to: termFields(version.terms),
    };
  }

  /** The change waiting for this partner, as they will read it; null when nothing is waiting. */
  async forPartner(partner: AssetPartnerDoc): Promise<AmendmentView | null> {
    const version = await assetPartnerTermsService.pending(partner._id);
    if (!version) return null;
    const t = await this.text(partner, version);
    return { versionId: version._id, ...t, requestedFrom: new Date(version.requestedFrom).toISOString(), reason: version.reason };
  }

  /** The partner signs the change: sealed in its own envelope, then brought into force. */
  async sign(partner: AssetPartnerDoc, input: { versionId: string; signedName: string; templateVersion: number }, ctx: Ctx) {
    const version = await assetPartnerTermsService.pending(partner._id);
    if (!version || version._id !== input.versionId) throw new ConflictError('This change is no longer waiting for your signature.', 'CHANGE_CLOSED');
    const signedName = input.signedName.trim().replace(/\s+/g, ' ');
    if (signedName.length < 2) throw new ValidationError('Type your full legal name to sign');
    const now = new Date();
    const t = await this.text(partner, version, signedName, now);
    if (t.version !== input.templateVersion) throw new ConflictError('The text was updated. Please read it again and sign.', 'AGREEMENT_OUTDATED');

    const envelope = await assetPartnerEnvelopeService.seal({
      partner,
      purpose: 'amendment',
      termsVersionId: version._id,
      docs: [{ kind: 'amendment', title: t.title, version: t.version, text: t.body }],
      signerName: signedName,
      signerEmail: partner.email,
      terms: version.terms,
      ctx,
      at: now,
    });
    const active = await assetPartnerTermsService.activate(version._id, now, envelope.envelopeId);
    void assetPartnerEnvelopeService.sendCopy(envelope, ctx);
    emit(EVENTS.ASSET_PARTNER_TERMS_SIGNED, partner._id, { partnerId: partner._id, name: partner.displayName, envelopeId: envelope.envelopeId, effectiveFrom: active.effectiveFrom });
    return { envelopeId: envelope.envelopeId, effectiveFrom: active.effectiveFrom };
  }

  async decline(partner: AssetPartnerDoc, ctx: Ctx): Promise<void> {
    const version = await assetPartnerTermsService.pending(partner._id);
    if (!version) throw new NotFoundError('Waiting change');
    await assetPartnerTermsService.close(partner._id, 'declined', partner.userId);
    await assetPartnerEnvelopeService.recordEvent(partner._id, 'amendment', 'declined', ctx, { termsVersionId: version._id }).catch(() => undefined);
    emit(EVENTS.ASSET_PARTNER_TERMS_DECLINED, partner._id, { partnerId: partner._id, name: partner.displayName });
  }
}

export const assetPartnerAmendmentService = new AssetPartnerAmendmentService();
