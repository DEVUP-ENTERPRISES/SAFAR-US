import { AssetPartnerModel, type AssetPartnerDoc, type PartnerContact, type PartnerProfile, type Residency } from '../infrastructure/asset-partner.model';
import { AssetPartnerApplicationModel, type AssetPartnerApplicationDoc } from '../infrastructure/asset-partner-application.model';
import { KycModel, type KycDoc } from '../../kyc/infrastructure/kyc.model';
import { kycService } from '../../kyc/application/kyc.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { assetPartnerContactConfirmService } from './asset-partner-contact-confirm.service';

export interface ProfileInput {
  emergencyContacts: PartnerContact[];
  representative?: PartnerContact | null;
  residency: Residency;
  visaExpiry?: Date;
  preferredContact?: 'call' | 'text' | 'email';
}

export type IdentityState = 'verified' | 'confirmed_by_staff' | 'pending' | 'rejected' | 'not_started';

export interface PartnerIdentity {
  state: IdentityState;
  required: boolean;
  /** The name read off the ID, for staff only. */
  verifiedName?: string;
  /** Null when there is no verified name to compare yet. */
  nameMatches: boolean | null;
  reason?: string;
  override?: { by: string; at: Date; reason: string };
}

const digits = (s: string) => s.replace(/\D/g, '');
const tidy = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ');
const normName = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z ]/g, '').split(' ').filter(Boolean);
const SEEN_EVERY_MS = 60 * 60_000;

/** Same person if the first and last words of the ID name both appear in the name they applied with. */
export function namesMatch(idName: string, appliedName: string): boolean {
  const id = normName(idName);
  const applied = new Set(normName(appliedName));
  if (id.length === 0 || applied.size === 0) return false;
  return applied.has(id[0]) && applied.has(id[id.length - 1]);
}

function cleanContact(c: PartnerContact, what: string): PartnerContact {
  const name = tidy(c.name);
  const phone = digits(c.phone);
  const relation = tidy(c.relation);
  if (name.length < 2) throw new ValidationError(`Enter the ${what}’s full name`);
  if (phone.length < 10 || phone.length > 15) throw new ValidationError(`Enter a phone number for the ${what} with area code`);
  if (relation.length < 2) throw new ValidationError(`Say how the ${what} is related to you`);
  const email = tidy(c.email).toLowerCase() || undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError(`Check the ${what}’s email address`);
  return { name, phone, relation, ...(email ? { email } : {}) };
}

/** The profile as shown to the partner or staff: confirmation state without the link fingerprint. */
export function publicProfile(profile?: PartnerProfile | null): PartnerProfile | null {
  if (!profile) return null;
  const clean = (c: PartnerContact): PartnerContact => {
    if (!c.confirmation) return c;
    const { tokenHash: _t, ip: _i, ...rest } = c.confirmation;
    return { ...c, confirmation: rest as PartnerContact['confirmation'] };
  };
  return { ...profile, emergencyContacts: (profile.emergencyContacts ?? []).map(clean), ...(profile.representative ? { representative: clean(profile.representative) } : {}) };
}

export const assetPartnerProfileService = {
  isComplete(partner: Pick<AssetPartnerDoc, 'profile'>): boolean {
    return !!partner.profile?.completedAt && (partner.profile.emergencyContacts?.length ?? 0) > 0;
  },

  /** Saves who to call if the partner can't be reached; their own number can't be their emergency contact. */
  async save(userId: string, input: ProfileInput): Promise<PartnerProfile> {
    const partner = await AssetPartnerModel.findOne({ userId }).lean<AssetPartnerDoc>();
    if (!partner) throw new ForbiddenError('Not an Asset Partner');
    if (!input.emergencyContacts?.length) throw new ValidationError('Add at least one emergency contact');
    if (input.emergencyContacts.length > 3) throw new ValidationError('Add up to three emergency contacts');

    const contacts = input.emergencyContacts.map((c) => cleanContact(c, 'emergency contact'));
    const own = digits(partner.phone ?? '');
    if (own && contacts.some((c) => c.phone.slice(-10) === own.slice(-10))) {
      throw new ValidationError('Your emergency contact needs a phone number other than your own');
    }
    if (new Set(contacts.map((c) => c.phone)).size !== contacts.length) throw new ValidationError('Each emergency contact needs a different phone number');
    const representative = input.representative ? cleanContact(input.representative, 'representative') : undefined;

    let visaExpiry: Date | undefined;
    if (input.residency === 'visa') {
      if (!input.visaExpiry || Number.isNaN(new Date(input.visaExpiry).getTime())) throw new ValidationError('Enter the date your visa ends');
      visaExpiry = new Date(input.visaExpiry);
      if (visaExpiry.getTime() < Date.now() - 24 * 3600_000) throw new ValidationError('That visa date has passed. Enter your current visa’s end date');
    }

    const profile: PartnerProfile = {
      emergencyContacts: contacts,
      ...(representative ? { representative } : {}),
      residency: input.residency,
      ...(visaExpiry ? { visaExpiry } : {}),
      ...(input.preferredContact ? { preferredContact: input.preferredContact } : {}),
      completedAt: partner.profile?.completedAt ?? new Date(),
    };
    const toConfirm = assetPartnerContactConfirmService.carryOver(partner.profile, profile);
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { profile } });
    logger.info({ partnerId: partner._id, contacts: contacts.length, residency: input.residency, toConfirm: toConfirm.length }, 'Asset Partner profile saved');
    // Texts go out after the save; a slow or failed text never loses what the partner typed.
    await assetPartnerContactConfirmService.sendAll({ ...partner, profile }, toConfirm);
    return (await AssetPartnerModel.findById(partner._id).select('profile').lean<AssetPartnerDoc>())?.profile ?? profile;
  },

  /** Records that the partner opened their portal, at most once an hour. */
  async touch(userId: string): Promise<void> {
    const now = new Date();
    await AssetPartnerModel.updateOne(
      { userId, $or: [{ lastSeenAt: { $exists: false } }, { lastSeenAt: { $lt: new Date(now.getTime() - SEEN_EVERY_MS) } }] },
      { $set: { lastSeenAt: now } },
    ).catch(() => undefined);
  },

  async identityRequired(partner: Pick<AssetPartnerDoc, 'agreementRequired'>): Promise<boolean> {
    return !!partner.agreementRequired && (await platformConfigService.get()).assetPartner.requireIdentity !== false;
  },

  /** The partner's ID check; `sync` asks Stripe for a pending result, which only the partner's own view needs. */
  async identity(partner: AssetPartnerDoc, opts: { sync?: boolean } = {}): Promise<PartnerIdentity> {
    const required = await this.identityRequired(partner);
    if (opts.sync) await kycService.getStatus(partner.userId).catch(() => undefined);
    const kyc = await KycModel.findOne({ userId: partner.userId }).lean<KycDoc>();
    const verifiedName = [kyc?.verifiedFirstName, kyc?.verifiedLastName].filter(Boolean).join(' ') || undefined;
    let nameMatches: boolean | null = null;
    if (verifiedName) {
      const app = partner.applicationId
        ? await AssetPartnerApplicationModel.findById(partner.applicationId).select('fullName').lean<Pick<AssetPartnerApplicationDoc, 'fullName'>>()
        : null;
      const applied = app?.fullName ?? partner.agreement?.signedName ?? partner.displayName;
      nameMatches = namesMatch(verifiedName, applied);
    }
    const base = { required, verifiedName, nameMatches, override: partner.identityOverride };
    if (kyc?.status === 'approved') return { ...base, state: 'verified' };
    if (partner.identityOverride) return { ...base, state: 'confirmed_by_staff' };
    if (kyc?.status === 'pending') return { ...base, state: 'pending' };
    if (kyc?.status === 'rejected') return { ...base, state: 'rejected', reason: kyc.rejectionReason };
    return { ...base, state: 'not_started' };
  },

  isIdentityDone(identity: PartnerIdentity): boolean {
    return identity.state === 'verified' || identity.state === 'confirmed_by_staff';
  },

  /** Staff confirm the partner's ID in person when Stripe can't be used; the reason is kept with the record. */
  async overrideIdentity(partnerId: string, by: string, reason: string): Promise<void> {
    const text = tidy(reason);
    if (text.length < 10) throw new ValidationError('Say how you checked their ID (at least a short sentence)');
    const res = await AssetPartnerModel.updateOne({ _id: partnerId }, { $set: { identityOverride: { by, at: new Date(), reason: text } } });
    if (!res.matchedCount) throw new NotFoundError('Asset Partner');
    logger.warn({ partnerId, by }, 'Asset Partner identity confirmed by staff');
  },
};
