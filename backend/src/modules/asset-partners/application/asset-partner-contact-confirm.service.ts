import { createHash, randomBytes } from 'node:crypto';
import { AssetPartnerModel, type AssetPartnerDoc, type ContactConfirmation, type PartnerContact, type PartnerProfile } from '../infrastructure/asset-partner.model';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { notificationService } from '../../notifications/application/notification.service';
import { config } from '../../../config';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

const DAY = 24 * 3600_000;
const LINK_DAYS = 14;
const RESEND_GAP_MS = 10 * 60_000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const digits = (s: string) => s.replace(/\D/g, '');

/** US numbers are stored as 10 digits; Twilio wants +1XXXXXXXXXX. */
export function toE164(phone: string): string {
  const d = digits(phone);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

/** "Jordan R." — the contact learns who named them, not the partner's full details. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

type Slot = { kind: 'emergency'; index: number } | { kind: 'representative' };
const sameContact = (a?: PartnerContact, b?: PartnerContact) => !!a && !!b && digits(a.phone) === digits(b.phone) && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

function contactAt(profile: PartnerProfile | undefined, slot: Slot): PartnerContact | undefined {
  return slot.kind === 'representative' ? profile?.representative : profile?.emergencyContacts?.[slot.index];
}
const pathOf = (slot: Slot) => (slot.kind === 'representative' ? 'profile.representative' : `profile.emergencyContacts.${slot.index}`);

/** Each emergency contact and representative confirms by a link sent to their own phone (and email), so a wrong or unknowing contact shows up early. */
export const assetPartnerContactConfirmService = {
  /** Keeps the confirmation of anyone unchanged; anyone new or edited starts over. Returns who needs a link. */
  carryOver(prev: PartnerProfile | undefined, next: PartnerProfile): Slot[] {
    const fresh: Slot[] = [];
    next.emergencyContacts = next.emergencyContacts.map((c, index) => {
      const before = prev?.emergencyContacts?.find((p) => sameContact(p, c));
      if (before?.confirmation && before.confirmation.status !== 'declined') return { ...c, confirmation: before.confirmation };
      fresh.push({ kind: 'emergency', index });
      return { ...c, confirmation: undefined };
    });
    if (next.representative) {
      const before = prev?.representative;
      if (sameContact(before, next.representative) && before?.confirmation && before.confirmation.status !== 'declined') next.representative = { ...next.representative, confirmation: before.confirmation };
      else fresh.push({ kind: 'representative' });
    }
    return fresh;
  },

  /** Mints a link, stores only its fingerprint, and texts (and emails) it. Failure to deliver is recorded, never thrown. */
  async send(partner: Pick<AssetPartnerDoc, '_id' | 'displayName'>, slot: Slot, contact: PartnerContact): Promise<ContactConfirmation> {
    const token = randomBytes(24).toString('base64url');
    const now = new Date();
    const base = config.notifications.partnerWebUrl || config.notifications.webUrl;
    const link = `${base}/contact-confirm?t=${token}`;
    const role = slot.kind === 'representative' ? 'the person who can decide about their car' : 'their emergency contact';
    const body = `${shortName(partner.displayName)} named you as ${role} with CatoDrive. We’d only call you if we can’t reach them. Confirm or decline: ${link}`;

    const sms = await channelProviders.sms
      .send({ target: { userId: `contact:${partner._id}`, phone: toE164(contact.phone) }, templateKey: 'partner.contact_confirm', title: 'CatoDrive', body })
      .catch((err: Error) => ({ ok: false as const, error: err.message, retryable: false }));
    let emailed = false;
    if (contact.email) {
      const mail = await channelProviders.email
        .send({ target: { userId: `contact:${partner._id}`, email: contact.email }, templateKey: 'partner.contact_confirm', title: `${shortName(partner.displayName)} named you as their contact`, body, deepLink: link, actionLabel: 'Confirm or decline' })
        .catch(() => ({ ok: false as const }));
      emailed = mail.ok;
    }
    const confirmation: ContactConfirmation = {
      status: sms.ok || emailed ? 'pending' : 'undeliverable',
      tokenHash: hash(token),
      sentAt: now,
      expiresAt: new Date(now.getTime() + LINK_DAYS * DAY),
      ...(sms.ok ? {} : { lastError: String((sms as { error?: string }).error ?? 'not sent').slice(0, 200) }),
    };
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { [`${pathOf(slot)}.confirmation`]: confirmation } });
    if (!sms.ok) logger.warn({ partnerId: partner._id, slot, error: confirmation.lastError }, 'emergency contact confirmation text not sent');
    return confirmation;
  },

  async sendAll(partner: AssetPartnerDoc, slots: Slot[]): Promise<void> {
    for (const slot of slots) {
      const c = contactAt(partner.profile, slot);
      if (c) await this.send(partner, slot, c).catch((err) => logger.warn({ err, partnerId: partner._id }, 'contact confirmation failed'));
    }
  },

  /** The partner sends the link again, at most once every ten minutes per contact. */
  async resend(userId: string, slot: Slot): Promise<ContactConfirmation> {
    const partner = await AssetPartnerModel.findOne({ userId }).lean<AssetPartnerDoc>();
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    const c = contactAt(partner.profile, slot);
    if (!c) throw new NotFoundError('Contact');
    if (c.confirmation?.status === 'confirmed') throw new ConflictError('This contact has already confirmed.', 'CONTACT_CONFIRMED');
    if (c.confirmation?.sentAt && Date.now() - new Date(c.confirmation.sentAt).getTime() < RESEND_GAP_MS) {
      throw new ConflictError('We just sent it. Please wait a few minutes before sending again.', 'CONTACT_RESEND_TOO_SOON');
    }
    return this.send(partner, slot, c);
  },

  findByToken: async (token: string) => {
    const h = hash(token);
    const partner = await AssetPartnerModel.findOne({ $or: [{ 'profile.emergencyContacts.confirmation.tokenHash': h }, { 'profile.representative.confirmation.tokenHash': h }] }).lean<AssetPartnerDoc>();
    if (!partner?.profile) return null;
    const index = partner.profile.emergencyContacts.findIndex((c) => c.confirmation?.tokenHash === h);
    const slot: Slot = index >= 0 ? { kind: 'emergency', index } : { kind: 'representative' };
    const contact = contactAt(partner.profile, slot)!;
    return { partner, slot, contact };
  },

  /** What the contact sees before answering; nothing private about the partner. */
  async view(token: string) {
    const found = await this.findByToken(token);
    if (!found) return { valid: false as const };
    const { partner, slot, contact } = found;
    const expired = !!contact.confirmation?.expiresAt && new Date(contact.confirmation.expiresAt) < new Date();
    return {
      valid: true as const,
      expired,
      status: contact.confirmation?.status ?? 'pending',
      partnerName: shortName(partner.displayName),
      contactName: contact.name.split(/\s+/)[0],
      role: slot.kind,
    };
  },

  async respond(token: string, decision: 'confirmed' | 'declined', ctx: { ip?: string }): Promise<{ status: string }> {
    const found = await this.findByToken(token);
    if (!found) throw new NotFoundError('Link');
    const { partner, slot, contact } = found;
    const conf = contact.confirmation!;
    if (conf.status === 'confirmed' || conf.status === 'declined') return { status: conf.status };
    if (conf.expiresAt && new Date(conf.expiresAt) < new Date()) throw new ConflictError('This link has expired. Ask the person who named you to send it again.', 'CONTACT_LINK_EXPIRED');
    const path = pathOf(slot);
    await AssetPartnerModel.updateOne(
      { _id: partner._id, [`${path}.confirmation.tokenHash`]: conf.tokenHash },
      { $set: { [`${path}.confirmation.status`]: decision, [`${path}.confirmation.respondedAt`]: new Date(), [`${path}.confirmation.ip`]: ctx.ip } },
    );
    logger.info({ partnerId: partner._id, slot, decision }, 'emergency contact responded');
    if (decision === 'declined') {
      await notificationService
        .send({
          userId: partner.userId,
          priority: 'high',
          deepLink: '/profile#emergency',
          templateKey: 'account.asset_partner_contact_declined',
          title: `${contact.name.split(/\s+/)[0]} declined to be your contact`,
          body: 'Please add someone else in your partner profile, so we can reach someone if we can’t reach you.',
          data: { partnerId: partner._id },
        })
        .catch(() => undefined);
    }
    return { status: decision };
  },
};

export type { Slot as ContactSlot };
