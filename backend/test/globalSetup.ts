import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Start one in-memory MongoDB for the whole test run. Its URI is passed to the
 * workers through the environment (they inherit it, being forked after this).
 * No production database is ever touched.
 */
export default async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryServer.create();
  (globalThis as unknown as { __MONGOD__?: MongoMemoryServer }).__MONGOD__ = mongod;
  process.env.MONGO_TEST_URI = mongod.getUri();
}
