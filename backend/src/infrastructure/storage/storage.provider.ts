import { config } from '../../config';
import { logger } from '../logging/logger';
import type { StorageGateway } from './storage.gateway';
import { MockStorageGateway } from './mock.storage';
import { S3StorageGateway } from './s3.storage';

/**
 * Real S3 when configured, otherwise the dev mock (placeholder image URLs).
 *
 * Storage is an OPTIONAL integration — a bad S3 config must degrade to the mock
 * gateway, never crash the API. Only the core data store (Mongo) is allowed to
 * be a hard boot requirement. So if the S3 client fails to construct for any
 * reason, log loudly and fall back so the server still comes up (uploads won't
 * persist to real S3 until the config is fixed).
 */
function selectStorage(): StorageGateway {
  if (!config.aws.enabled) {
    logger.info('Storage: Mock (dev)');
    return new MockStorageGateway();
  }
  try {
    const gw = new S3StorageGateway();
    logger.info('Storage: AWS S3 (live)');
    return gw;
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      '⚠️  S3 storage failed to initialise — falling back to mock storage. Uploads will NOT persist to real S3 until the AWS/S3 config is fixed.',
    );
    return new MockStorageGateway();
  }
}

export const storageGateway: StorageGateway = selectStorage();
