import { ValidationError } from '../../../core/errors/app-error';
import { resolveOwnedUpload } from '../../../infrastructure/storage/owned-upload';

export const MAX_BODY = 2000;
const MAX_ATTACHMENTS = 4;

export interface CleanAttachment {
  url: string;
  kind: 'image' | 'file';
  name?: string;
}

/** One gate for every way a message arrives (REST, socket): bounded text, and only the sender's own uploads as attachments. */
export function cleanMessage(senderId: string, body: unknown, attachments: unknown): { body: string; attachments: CleanAttachment[] } {
  const text = typeof body === 'string' ? body.trim() : '';
  if (text.length > MAX_BODY) throw new ValidationError(`Keep messages under ${MAX_BODY} characters`);
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length > MAX_ATTACHMENTS) throw new ValidationError(`Send up to ${MAX_ATTACHMENTS} photos at a time`);
  const clean = list.map((a: { url?: unknown; key?: unknown; kind?: unknown; name?: unknown }) => {
    const kind = a?.kind === 'file' ? 'file' : 'image';
    const ref = { url: typeof a?.url === 'string' ? a.url : undefined, key: typeof a?.key === 'string' ? a.key : undefined };
    const { url } = resolveOwnedUpload(ref, senderId, 'message');
    const name = typeof a?.name === 'string' ? a.name.slice(0, 120) : undefined;
    return { url, kind, ...(name ? { name } : {}) } as CleanAttachment;
  });
  if (!text && clean.length === 0) throw new ValidationError('Message cannot be empty');
  return { body: text, attachments: clean };
}
