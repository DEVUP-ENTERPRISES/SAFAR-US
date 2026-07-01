import mongoose from 'mongoose';
import { config } from '../../config';
import { logger } from '../logging/logger';

/**
 * MongoDB connection lifecycle. A replica set is required in production
 * for multi-document transactions (booking engine) and HA.
 */
export async function connectMongo(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => logger.info('✅ MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(config.db.uri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 8000,
  });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.connection.close();
}

export function isMongoHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}
