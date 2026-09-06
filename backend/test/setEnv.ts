/**
 * Test environment variables, set before any module (and therefore config) is
 * imported. config validates the env at import and process.exit(1)s if required
 * vars are missing — these throwaway values satisfy the schema. NODE_ENV=test
 * keeps the production guards off. None of these reach a real service.
 */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_TEST_URI ?? 'mongodb://127.0.0.1:27017/cato_test';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_fedcba9876543210';
process.env.JWT_ACCESS_TTL = '900';
process.env.JWT_REFRESH_TTL = '2592000';
