/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['<rootDir>/packages/*/src/**/*.test.ts'],
  // Workspace packages resolve to their sources, so a test never runs against a stale dist build.
  moduleNameMapper: {
    '^@neverland-money/(address-book|contract-helpers|contract-types)$':
      '<rootDir>/packages/$1/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  restoreMocks: true,
};
