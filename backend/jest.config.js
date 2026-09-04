/**
 * Jest was in devDependencies with no config and no tests.
 *
 * Scoped deliberately to pure logic — state machines, money maths, policy
 * decisions — which is where a wrong answer silently costs someone money and
 * where a test is cheap and stays true. Anything needing Mongo, Redis or Stripe
 * is verified by the scripted runs against a real database instead; mocking a
 * payment processor mostly tests the mock.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  // These are the files where a silent regression is expensive.
  collectCoverageFrom: [
    'src/modules/bookings/domain/**/*.ts',
    'src/modules/pricing/**/*.ts',
    'src/shared/utils/money*.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, strict: true } }],
  },
};
