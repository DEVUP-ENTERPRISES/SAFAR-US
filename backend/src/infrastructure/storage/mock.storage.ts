import { randomId } from '../../shared/utils/uuid';
import { config } from '../../config';
import type { StorageGateway, CreateUploadInput, UploadTarget } from './storage.gateway';

/** contentType → extension, mirroring the S3 gateway so keys look identical. */
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/**
 * Dev/local storage. Selected when no AWS creds are configured.
 *
 * The upload URL points back at our own API (`PUT /media/mock-upload/...`),
 * which accepts and discards the bytes. That matters: the client runs the exact
 * same "presign → PUT bytes → save publicUrl" path in dev as in production, so
 * an upload bug can't hide until the day S3 is switched on.
 */
export class MockStorageGateway implements StorageGateway {
  async createUploadTargets(input: CreateUploadInput): Promise<UploadTarget[]> {
    const now = new Date();
    const datePart = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const ext = EXT[input.contentType.toLowerCase()] ?? 'bin';
    const base = `http://localhost:${config.app.port}/api/v1/media/mock-upload`;

    return Array.from({ length: input.count }).map(() => {
      const key = `${input.category}/${datePart}/${input.ownerId}/${randomId()}.${ext}`;
      return {
        key,
        uploadUrl: `${base}/${key}`,
        // picsum renders a real, deterministic image so dev previews look right.
        publicUrl: `https://picsum.photos/seed/${encodeURIComponent(key)}/1200/800`,
      };
    });
  }

  /** No real object in dev — return a deterministic placeholder to preview. */
  async createDownloadUrl(key: string): Promise<string> {
    return `https://picsum.photos/seed/${encodeURIComponent(key)}/1200/800`;
  }
}
