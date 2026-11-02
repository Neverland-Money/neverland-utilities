/** @type {import('jest').Config} */
const common = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  moduleNameMapper: {
    '^@neverland-money/(address-book|contract-helpers|contract-types|math-utils)$':
      '<rootDir>/packages/$1/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
module.exports = {
  projects: [
    {
      ...common,
      displayName: 'neverland',
      testMatch: ['<rootDir>/packages/*/src/**/*.test.ts'],
      testPathIgnorePatterns: [
        '/contract-helpers/src/(erc20-contract|erc20-permit-contract|debt-token-contract|wallet-balance-provider|wrapped-native-gateway-contract|ui-pool-data-provider-contract)/',
        '/contract-helpers/src/commons/(lending-base-service|gas-station|utils|validators/validators)\\.test\\.ts$',
        '/pool-contract/(pool|pool-bundle)\\.test\\.ts$',
        '/math-utils/src/(?!math-regression.test.ts)',
      ],
      restoreMocks: true,
    },
    {
      ...common,
      displayName: 'upstream',
      testMatch: [
        ...[
          'erc20-contract',
          'erc20-permit-contract',
          'debt-token-contract',
          'wallet-balance-provider',
          'wrapped-native-gateway-contract',
          'ui-pool-data-provider-contract',
          'commons',
        ].map(directory => `<rootDir>/packages/contract-helpers/src/${directory}/**/*.test.ts`),
        '<rootDir>/packages/contract-helpers/src/pool-contract/pool.test.ts',
        '<rootDir>/packages/contract-helpers/src/pool-contract/pool-bundle.test.ts',
        '<rootDir>/packages/math-utils/src/**/*.test.ts',
      ],
      // Neverland-owned commons tests run once, in the neverland project.
      testPathIgnorePatterns: [
        '/math-regression.test.ts',
        '/commons/(abi-result|base-service)\\.test\\.ts$',
      ],
      // Original upstream tests create suite-scoped provider spies.
      restoreMocks: false,
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: {
              ...require('./tsconfig.test.json').compilerOptions,
              noUnusedLocals: false,
            },
          },
        ],
      },
    },
  ],
};
