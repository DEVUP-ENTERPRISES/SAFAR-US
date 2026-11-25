import { UserModel, type UserDoc, type Address, type EmergencyContact } from '../infrastructure/user.model';
import { NotFoundError, UnauthorizedError, ConflictError, AppError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import { generateSecret, otpauthUrl, verifyTotp } from '../../../shared/utils/totp';
import {
  evaluateProfile,
  ageInYears,
  type ProfileStatus,
} from '../domain/profile-completion';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { resolveOwnedUpload } from '../../../infrastructure/storage/owned-upload';

export interface OnboardingDto {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  avatarUrl?: string;
  address: { label?: string; line1: string; line2?: string; city: string; state: string; zip: string; country: string };
  emergencyContact: { name: string; phone: string; relation?: string };
}

export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  timezone?: string;
}

/** Customer self-service profile: identity, saved addresses, emergency contacts. */
/** One rule for a birth date anywhere it is entered: it must parse and clear the minimum rental age. */
function assertAdultDob(dob: string, minAgeYears: number): void {
  const age = ageInYears(dob);
  if (age == null) throw new AppError({ code: 'INVALID_DOB', message: 'Enter a valid date of birth.', httpStatus: 422 });
  if (age < minAgeYears) throw new AppError({ code: 'UNDERAGE', message: `You must be at least ${minAgeYears} to use CatoDrive.`, httpStatus: 422 });
}

// Insurance age falls back to the profile date, so it can't be edited once an ID has confirmed one.
async function assertDobEditable(userId: string): Promise<void> {
  if (await KycModel.exists({ userId, verifiedDob: { $ne: null } })) {
    throw new AppError({ code: 'DOB_LOCKED', message: 'Your date of birth comes from your verified ID. Contact support if it is wrong.', httpStatus: 409 });
  }
}

export class UserService {
  async get(userId: string): Promise<UserDoc> {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).lean<UserDoc>();
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<UserDoc> {
    const current = await this.get(userId);
    const set: Record<string, unknown> = {};
    (['firstName', 'lastName', 'phone', 'avatarUrl', 'dateOfBirth', 'timezone'] as const).forEach((k) => {
      if (patch[k] !== undefined) set[k] = patch[k];
    });
    // A new number has not been proven; the old confirmation does not carry over.
    if (patch.phone !== undefined && patch.phone !== current.phone) set.phoneVerified = false;
    if (patch.avatarUrl !== undefined && patch.avatarUrl !== current.avatarUrl) {
      set.avatarUrl = resolveOwnedUpload({ url: patch.avatarUrl }, userId, 'avatar').url;
    }
    if (patch.dateOfBirth !== undefined && patch.dateOfBirth !== current.dateOfBirth) {
      await assertDobEditable(userId);
      assertAdultDob(patch.dateOfBirth, (await platformConfigService.get()).legal.minAgeYears);
    }
    await UserModel.updateOne({ _id: userId }, set);
    return this.get(userId);
  }

  // ── Account setup gate ───────────────────────────────────────────────

  /** What (if anything) the guest still needs to set up before they can book. */
  async profileStatus(userId: string): Promise<ProfileStatus> {
    const [user, config] = await Promise.all([this.get(userId), platformConfigService.get()]);
    return evaluateProfile(user, { minAgeYears: config.legal.minAgeYears });
  }

  /**
   * One-shot account setup: writes the legal name, DOB, phone, photo, a home
   * address and an emergency contact atomically, then returns the resulting
   * completion status. Rejects a birth date below the configured minimum rental
   * age here (not just at the gate) so an underage account can never be
   * persisted as "complete".
   *
   * Idempotent-friendly: re-submitting replaces the primary address and
   * emergency contact rather than stacking duplicates, so a user editing their
   * setup does not accumulate rows.
   */
  async completeOnboarding(userId: string, dto: OnboardingDto): Promise<{ user: UserDoc; profile: ProfileStatus }> {
    const config = await platformConfigService.get();
    assertAdultDob(dto.dateOfBirth, config.legal.minAgeYears);
    const before = await this.get(userId);
    if (before.dateOfBirth && before.dateOfBirth !== dto.dateOfBirth) await assertDobEditable(userId);

    const address: Address = {
      id: randomId(),
      label: dto.address.label || 'Home',
      line1: dto.address.line1,
      line2: dto.address.line2?.trim() || undefined,
      city: dto.address.city,
      state: dto.address.state,
      zip: dto.address.zip,
      country: dto.address.country,
      isDefault: true,
    };
    const emergency: EmergencyContact = {
      id: randomId(),
      name: dto.emergencyContact.name,
      phone: dto.emergencyContact.phone,
      relation: dto.emergencyContact.relation,
    };

    try {
      await UserModel.updateOne(
        { _id: userId },
        {
          $set: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            dateOfBirth: dto.dateOfBirth,
            phone: dto.phone,
            ...(dto.phone !== before.phone ? { phoneVerified: false } : {}),
            ...(dto.avatarUrl ? { avatarUrl: dto.avatarUrl === before.avatarUrl ? dto.avatarUrl : resolveOwnedUpload({ url: dto.avatarUrl }, userId, 'avatar').url } : {}),
            // Setup writes the primary/home address and the emergency contact.
            // Replacing keeps re-submits from stacking duplicate rows.
            addresses: [address],
            emergencyContacts: [emergency],
          },
        },
      );
    } catch (err) {
      // The phone number is unique across accounts.
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictError('That mobile number is already on another CatoDrive account. Sign in to that account, or use a different number. If it’s yours and you can’t get in, contact support.', 'PHONE_TAKEN');
      }
      throw err;
    }

    const user = await this.get(userId);
    return { user, profile: evaluateProfile(user, { minAgeYears: config.legal.minAgeYears }) };
  }

  /** Per-channel / per-category notification preferences. Field-allowlisted. */
  async updateNotificationPrefs(
    userId: string,
    patch: {
      push?: boolean; email?: boolean; sms?: boolean; smsCriticalOnly?: boolean; quietHours?: boolean;
      categories?: Partial<Record<'trips' | 'messages' | 'payments' | 'promotions' | 'reviews' | 'account', boolean>>;
    },
  ): Promise<UserDoc['notificationPrefs']> {
    const set: Record<string, unknown> = {};
    (['push', 'email', 'sms', 'smsCriticalOnly', 'quietHours'] as const).forEach((k) => {
      if (patch[k] !== undefined) set[`notificationPrefs.${k}`] = patch[k];
    });
    if (patch.categories) {
      for (const [cat, val] of Object.entries(patch.categories)) {
        if (typeof val === 'boolean') set[`notificationPrefs.categories.${cat}`] = val;
      }
    }
    if (Object.keys(set).length) await UserModel.updateOne({ _id: userId }, { $set: set });
    return (await this.get(userId)).notificationPrefs;
  }

  // ── Addresses ────────────────────────────────────────────────────────
  async addAddress(userId: string, addr: Omit<Address, 'id' | 'isDefault' | 'label'> & { label?: string; isDefault?: boolean }): Promise<UserDoc> {
    const user = await this.get(userId);
    const makeDefault = addr.isDefault || user.addresses.length === 0;
    if (makeDefault) user.addresses.forEach((a) => (a.isDefault = false));
    const entry: Address = { ...addr, label: addr.label?.trim() || (user.addresses.length === 0 ? 'Home' : 'Address'), line2: addr.line2?.trim() || undefined, id: randomId(), isDefault: makeDefault };
    await UserModel.updateOne(
      { _id: userId },
      { $set: { addresses: [...user.addresses, entry] } },
    );
    return this.get(userId);
  }

  /** Change a saved address in place (street, unit, city, state, ZIP); optionally make it the main one. */
  async updateAddress(
    userId: string,
    addressId: string,
    patch: Partial<Pick<Address, 'line1' | 'line2' | 'city' | 'state' | 'zip' | 'country' | 'label'>> & { isDefault?: boolean },
  ): Promise<UserDoc> {
    const user = await this.get(userId);
    const target = user.addresses.find((a) => a.id === addressId);
    if (!target) throw new NotFoundError('Address');
    const { isDefault, line2, label, ...rest } = patch;
    Object.assign(target, rest, { line2: line2?.trim() || undefined }, label?.trim() ? { label: label.trim() } : {});
    if (isDefault) user.addresses.forEach((a) => (a.isDefault = a.id === addressId));
    await UserModel.updateOne({ _id: userId }, { $set: { addresses: user.addresses } });
    return this.get(userId);
  }

  async removeAddress(userId: string, addressId: string): Promise<UserDoc> {
    const user = await this.get(userId);
    const remaining = user.addresses.filter((a) => a.id !== addressId);
    if (remaining.length && !remaining.some((a) => a.isDefault)) remaining[0].isDefault = true;
    await UserModel.updateOne({ _id: userId }, { $set: { addresses: remaining } });
    return this.get(userId);
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<UserDoc> {
    const user = await this.get(userId);
    user.addresses.forEach((a) => (a.isDefault = a.id === addressId));
    await UserModel.updateOne({ _id: userId }, { $set: { addresses: user.addresses } });
    return this.get(userId);
  }

  // ── Emergency contacts ────────────────────────────────────────────────
  async addEmergencyContact(userId: string, c: Omit<EmergencyContact, 'id'>): Promise<UserDoc> {
    const entry: EmergencyContact = { ...c, id: randomId() };
    await UserModel.updateOne({ _id: userId }, { $push: { emergencyContacts: entry } });
    return this.get(userId);
  }

  async removeEmergencyContact(userId: string, contactId: string): Promise<UserDoc> {
    await UserModel.updateOne({ _id: userId }, { $pull: { emergencyContacts: { id: contactId } } });
    return this.get(userId);
  }

  // ── Two-factor authentication (TOTP) ─────────────────────────────────
  /**
   * Register a device's push token so notifications can reach it.
   *
   * Idempotent via $addToSet — the same device re-registering (app relaunch,
   * token refresh) does not pile up duplicates. A dead token is pruned by the
   * push provider when it reports the token invalid.
   */
  async registerDevice(userId: string, token: string): Promise<{ registered: boolean }> {
    await UserModel.updateOne({ _id: userId }, { $addToSet: { pushTokens: token } });
    return { registered: true };
  }

  /** Drop a token — sign-out on a device, or an explicit opt-out. */
  async unregisterDevice(userId: string, token: string): Promise<{ removed: boolean }> {
    const r = await UserModel.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
    return { removed: r.modifiedCount > 0 };
  }

  async mfaStatus(userId: string): Promise<{ enabled: boolean }> {
    const user = await this.get(userId);
    return { enabled: !!user.mfa?.enabled };
  }

  /** Begin enrollment: generate a secret + otpauth URL for the authenticator app. */
  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.get(userId);
    if (user.mfa?.enabled) throw new ConflictError('MFA already enabled', 'MFA_ENABLED');
    const secret = generateSecret();
    await UserModel.updateOne({ _id: userId }, { $set: { 'mfa.pendingSecret': secret } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email ?? userId) };
  }

  /** Confirm enrollment with a code from the app. */
  async enableMfa(userId: string, token: string): Promise<{ enabled: boolean }> {
    const user = await UserModel.findById(userId).select('+mfa.pendingSecret').lean<UserDoc>();
    const pending = user?.mfa?.pendingSecret;
    if (!pending) throw new ConflictError('Start MFA setup first', 'MFA_NO_PENDING');
    if (!verifyTotp(pending, token)) throw new UnauthorizedError('Invalid authentication code');
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'mfa.enabled': true, 'mfa.secret': pending, 'mfa.enabledAt': new Date() }, $unset: { 'mfa.pendingSecret': '' } },
    );
    return { enabled: true };
  }

  async disableMfa(userId: string, token: string): Promise<{ enabled: boolean }> {
    const user = await UserModel.findById(userId).select('+mfa.secret').lean<UserDoc>();
    const secret = user?.mfa?.secret;
    if (!secret) return { enabled: false };
    if (!verifyTotp(secret, token)) throw new UnauthorizedError('Invalid authentication code');
    await UserModel.updateOne({ _id: userId }, { $set: { 'mfa.enabled': false }, $unset: { 'mfa.secret': '' } });
    return { enabled: false };
  }
}

export const userService = new UserService();
