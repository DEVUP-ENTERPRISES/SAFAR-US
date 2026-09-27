import { UserModel } from '../infrastructure/user.model';
import { otpService } from '../../auth/application/otp.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { config } from '../../../config';
import { kv } from '../../../infrastructure/cache/kv-store';
import { logger } from '../../../infrastructure/logging/logger';

/** A channel that just failed to deliver is treated as unavailable for this long, so it cannot block anyone from booking. */
const DEGRADED_SECONDS = 1800;
const degradedKey = (channel: ContactChannel) => `contact:degraded:${channel}`;

/** Whether a delivery channel failed recently; eligibility stops requiring that contact while it is down. */
export async function channelDegraded(channel: ContactChannel): Promise<boolean> {
  return !!(await kv().get(degradedKey(channel)).catch(() => null));
}

export type ContactChannel = 'email' | 'phone';
const PURPOSE: Record<ContactChannel, string> = { email: 'verify_email', phone: 'verify_phone' };

/**
 * A signed-in member proving they own the email or mobile number on their account.
 *
 * Booking eligibility requires both (admin can relax either), but the only way to
 * get either flag used to be signing in with a one-time code, so a member who
 * registered with a password could never book. This sends a code to the contact
 * on file and, once confirmed, releases any booking waiting on it.
 */
export const contactVerificationService = {
  async send(userId: string, channel: ContactChannel): Promise<{ sent: boolean; to: string; via: ContactChannel | 'none'; devCode?: string; message?: string }> {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).lean();
    if (!user) throw new NotFoundError('User');
    const target = channel === 'email' ? user.email : user.phone;
    if (!target) throw new ValidationError(channel === 'email' ? 'Add an email address first.' : 'Add your mobile number first.');
    if (channel === 'email' ? user.emailVerified : user.phoneVerified) throw new ConflictError('Already confirmed.', 'ALREADY_VERIFIED');

    const code = await otpService.request(PURPOSE[channel], target);
    const message = {
      target: { userId, email: user.email, phone: user.phone },
      templateKey: `account.verify_${channel}`,
      title: `${config.app.name} confirmation code`,
      body: `${code} is your ${config.app.name} code to confirm your ${channel === 'email' ? 'email address' : 'mobile number'}. It expires in 5 minutes.`,
    };
    const mask = (c: ContactChannel, t: string) => (c === 'email' ? t.replace(/^(.).*(@.*)$/, '$1***$2') : `•••${t.slice(-4)}`);
    const devCode = config.isProd ? undefined : code;

    const first = await (channel === 'email' ? channelProviders.email : channelProviders.sms).send(message).catch((err: Error) => ({ ok: false, error: err.message }));
    if (first.ok) return { sent: true, via: channel, to: mask(channel, target), devCode };

    // The provider failed (Twilio or SMTP down, wrong credentials, number unreachable): mark it down so it cannot block anyone, and try the other channel.
    logger.error({ userId, channel, err: (first as { error?: string }).error }, 'contact code could not be delivered');
    await kv().set(degradedKey(channel), '1', DEGRADED_SECONDS).catch(() => undefined);
    // The requirement just lifted, so a booking waiting only on this contact can move on now.
    emit(EVENTS.CONTACT_VERIFIED, userId, { userId, channel, waived: true });
    const other: ContactChannel = channel === 'email' ? 'phone' : 'email';
    const otherTarget = other === 'email' ? user.email : user.phone;
    if (otherTarget) {
      const second = await (other === 'email' ? channelProviders.email : channelProviders.sms).send(message).catch(() => ({ ok: false }));
      if (second.ok) return { sent: true, via: other, to: mask(other, otherTarget), devCode, message: `We couldn't reach your ${channel === 'phone' ? 'phone' : 'email'}, so we sent the code to your ${other === 'email' ? 'email' : 'phone'} instead.` };
    }
    return { sent: false, via: 'none', to: mask(channel, target), devCode, message: 'We could not send a code right now. You can carry on booking; we will confirm this later.' };
  },

  async confirm(userId: string, channel: ContactChannel, code: string): Promise<{ verified: true }> {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).lean();
    if (!user) throw new NotFoundError('User');
    const target = channel === 'email' ? user.email : user.phone;
    if (!target) throw new ValidationError('Nothing to confirm.');
    await otpService.verify(PURPOSE[channel], target, code);
    // Bound to the value the code was sent to, so changing the contact in between cannot confirm the new one.
    await UserModel.updateOne(
      { _id: userId, [channel === 'email' ? 'email' : 'phone']: target },
      { $set: channel === 'email' ? { emailVerified: true } : { phoneVerified: true } },
    );
    emit(EVENTS.CONTACT_VERIFIED, userId, { userId, channel });
    return { verified: true };
  },
};
