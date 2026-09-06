/**
 * Two tiers of test run here.
 *
 *  1. Pure logic — state machines, money maths, policy, token signing, session
 *     and OTP stores (the last two backed by the in-memory KV store, no Redis).
 *     Fast, deterministic, no external services.
 *
 *  2. Integration — auth register/login/refresh against a REAL userRepository,
 *     backed by an ephemeral in-memory MongoDB (mongodb-memory-server) started
 *     once per run and thrown away after. Never touches a production database.
 *
 * setEnv runs before any module loads so config validates against test values
 * instead of exiting on a missing production env.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  setupFiles: ['<rootDir>/test/setEnv.ts'],
  globalSetup: '<rootDir>/test/globalSetup.ts',
  globalTeardown: '<rootDir>/test/globalTeardown.ts',
  // The in-memory Mongo binary can take a moment to boot on a cold CI runner.
  testTimeout: 30000,
  collectCoverageFrom: [
    // Money & policy — a wrong answer costs someone money.
    'src/modules/bookings/domain/**/*.ts',
    'src/modules/pricing/**/*.ts',
    'src/shared/utils/money*.ts',
    // Auth & access — a wrong answer is a breach.
    'src/modules/auth/application/**/*.ts',
    'src/modules/auth/infrastructure/**/*.ts',
    'src/shared/middleware/authorize.ts',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, strict: true } }],
  },
};
