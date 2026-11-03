import type { AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { otpService } from '../../auth/application/otp.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { ValidationError } from '../../../core/errors/app-error';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';

const PURPOSE = 'partner_signing';

/** The address a partner's documents are signed and delivered to: their account email, which they proved at sign-up. */
async function emailFor(partner: AssetPartnerDoc): Promise<string> {
  const user = await UserModel.findById(partner.userId).select('email').lean<{ email?: string }>();
  const email = user?.email ?? partner.email;
  if (!email) throw new ValidationError('Add an email address to your account before signing.');
  return email.toLowerCase();
}

const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${'•'.repeat(Math.min(b.length, 6))}${c}`);

/** Signer authentication like an e-signature service: a one-time code to the signer's email, required at the moment of signing. */
export const assetPartnerSigningCode = {
  async send(partner: AssetPartnerDoc): Promise<{ sentTo: string; devCode?: string }> {
    const email = await emailFor(partner);
    const code = await otpService.request(PURPOSE, email);
    const res = await channelProviders.email.send({
      target: { userId: partner.userId, email },
      templateKey: 'account.asset_partner_signing_code',
      title: `Your CatoDrive signing code: ${code}`,
      body: `Enter ${code} to sign your documents. It expires in 5 minutes. If you didn’t ask for it, ignore this email and nothing is signed.`,
    });
    if (!res.ok) logger.error({ partnerId: partner._id, error: res.error }, 'signing code email failed');
    // Tests and local runs have no inbox; production never returns the code.
    return { sentTo: mask(email), devCode: config.isProd ? undefined : code };
  },

  /** Throws unless the code is the one just emailed; returns the address it proved, for the signing record. */
  async verify(partner: AssetPartnerDoc, code: string | undefined): Promise<string> {
    if (!code || !/^\d{6}$/.test(code.trim())) throw new ValidationError('Enter the 6-digit code we emailed you.');
    const email = await emailFor(partner);
    await otpService.verify(PURPOSE, email, code.trim());
    return email;
  },
};
