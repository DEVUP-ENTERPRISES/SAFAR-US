import mongoose from 'mongoose';

/** Connect the worker to the shared in-memory MongoDB (URI from globalSetup). */
export async function connectTestDb(): Promise<void> {
  const uri = process.env.MONGO_TEST_URI ?? process.env.MONGO_URI!;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
}

/** Wipe every collection between tests, so each test starts from a clean slate. */
export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
}
