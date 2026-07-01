import { randomId } from '../../shared/utils/uuid';
import type { StorageGateway, CreateUploadInput, UploadTarget } from './storage.gateway';

/**
 * Dev/local storage gateway. Returns a dummy upload URL and a working
 * placeholder public URL so image flows are testable without AWS creds.
 * Replace with S3Gateway (same interface) in production.
 */
export class MockStorageGateway implements StorageGateway {
  async createUploadTargets(input: CreateUploadInput): Promise<UploadTarget[]> {
    return Array.from({ length: input.count }).map(() => {
      const key = `${input.category}/${input.ownerId}/${randomId()}`;
      return {
        key,
        uploadUrl: `https://mock-upload.local/${key}`,
        // picsum renders a real deterministic image for dev previews.
        publicUrl: `https://picsum.photos/seed/${encodeURIComponent(key)}/1200/800`,
      };
    });
  }
}

export const storageGateway: StorageGateway = new MockStorageGateway();
