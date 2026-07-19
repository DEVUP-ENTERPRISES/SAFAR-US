import { config } from '../../config';
import { logger } from '../logging/logger';
import type { StorageGateway } from './storage.gateway';
import { MockStorageGateway } from './mock.storage';
import { S3StorageGateway } from './s3.storage';

/** Real S3 when configured, otherwise the dev mock (placeholder image URLs). */
export const storageGateway: StorageGateway = config.aws.enabled
  ? new S3StorageGateway()
  : new MockStorageGateway();

logger.info(`Storage: ${config.aws.enabled ? 'AWS S3 (live)' : 'Mock (dev)'}`);
