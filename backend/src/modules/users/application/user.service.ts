import { UserModel, type UserDoc, type Address, type EmergencyContact } from '../infrastructure/user.model';
import { NotFoundError, UnauthorizedError, ConflictError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';
import { generateSecret, otpauthUrl, verifyTotp } from '../../../shared/utils/totp';

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
