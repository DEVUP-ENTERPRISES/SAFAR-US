import { UserModel } from '../infrastructure/user.model';
import { otpService } from '../../auth/application/otp.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { config } from '../../../config';

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
  async send(userId: string, channel: ContactChannel): Promise<{ sent: true; to: string; devCode?: string }> {
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
    await (channel === 'email' ? channelProviders.email : channelProviders.sms).send(message);
    const masked = channel === 'email' ? target.replace(/^(.).*(@.*)$/, '$1***$2') : `•••${target.slice(-4)}`;
    return { sent: true, to: masked, devCode: config.isProd ? undefined : code };
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
