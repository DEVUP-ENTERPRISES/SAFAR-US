import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../../../config';
import { ConflictError } from '../../../core/errors/app-error';

/** A secret sealed with AES-256-GCM: iv, auth tag and ciphertext, all base64. */
export interface SealedSecret {
  iv: string;
  tag: string;
  data: string;
}

function key(): Buffer {
  const raw = config.tolls.credentialsKey;
  if (!raw) throw new ConflictError('Saving toll logins is not set up on the server yet.', 'TOLL_VAULT_NOT_CONFIGURED');
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new ConflictError('The server’s toll login key is the wrong length.', 'TOLL_VAULT_BAD_KEY');
  return buf;
}

export const credentialVault = {
  isConfigured: () => !!config.tolls.credentialsKey,

  seal(plain: string): SealedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  },

  open(sealed: SealedSecret): string {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
  },
};
