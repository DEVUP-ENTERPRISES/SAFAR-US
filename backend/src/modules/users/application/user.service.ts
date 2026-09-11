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

export interface OnboardingDto {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  avatarUrl: string;
  address: { label?: string; line1: string; city: string; state: string; zip: string; country: string };
  emergencyContact: { name: string; phone: string; relation?: string };
}

export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
}

/** Customer self-service profile: identity, saved addresses, emergency contacts. */
export class UserService {
  async get(userId: string): Promise<UserDoc> {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).lean<UserDoc>();
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<UserDoc> {
    const set: Record<string, unknown> = {};
    (['firstName', 'lastName', 'phone', 'avatarUrl', 'dateOfBirth'] as const).forEach((k) => {
      if (patch[k] !== undefined) set[k] = patch[k];
    });
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
    const age = ageInYears(dto.dateOfBirth);
    if (age == null) throw new AppError({ code: 'INVALID_DOB', message: 'Enter a valid date of birth.', httpStatus: 422 });
    if (age < config.legal.minAgeYears) {
      throw new AppError({
        code: 'UNDERAGE',
        message: `You must be at least ${config.legal.minAgeYears} to use CATO.`,
        httpStatus: 422,
      });
    }

    const address: Address = {
      id: randomId(),
      label: dto.address.label || 'Home',
      line1: dto.address.line1,
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
            avatarUrl: dto.avatarUrl,
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
        throw new ConflictError('That mobile number is already on another account.', 'PHONE_TAKEN');
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
  async addAddress(userId: string, addr: Omit<Address, 'id' | 'isDefault'> & { isDefault?: boolean }): Promise<UserDoc> {
    const user = await this.get(userId);
    const makeDefault = addr.isDefault || user.addresses.length === 0;
    if (makeDefault) user.addresses.forEach((a) => (a.isDefault = false));
    const entry: Address = { ...addr, id: randomId(), isDefault: makeDefault };
    await UserModel.updateOne(
      { _id: userId },
      { $set: { addresses: [...user.addresses, entry] } },
    );
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
