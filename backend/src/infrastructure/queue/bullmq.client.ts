import { Queue, Worker, type Processor, type ConnectionOptions } from 'bullmq';
import { config } from '../../config';
import { logger } from '../logging/logger';

/**
 * BullMQ requires a Redis connection with `maxRetriesPerRequest: null`, so it
 * gets its own connection distinct from the cache/session client.
 */
const connection: ConnectionOptions = (() => {
  const url = new URL(config.redis.url);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
})();

export function makeQueue(name: string): Queue {
  return new Queue(name, { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
}

export function makeWorker(name: string, processor: Processor, concurrency = 5): Worker {
  const worker = new Worker(name, processor, { connection, concurrency });
  worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err.message }, 'job failed'));
  worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'));
  return worker;
}

export { connection as queueConnection };
