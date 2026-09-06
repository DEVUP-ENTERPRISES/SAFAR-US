import type { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  const mongod = (globalThis as unknown as { __MONGOD__?: MongoMemoryServer }).__MONGOD__;
  await mongod?.stop();
}
