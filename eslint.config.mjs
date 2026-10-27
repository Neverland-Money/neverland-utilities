import xoTypescript from 'eslint-config-xo-typescript';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

const typescriptFiles = ['packages/**/*.ts', 'scripts/fixtures/**/*.ts'];

export default [
  {
    ignores: [
      '.claude/**',
      '.remember/**',
      '.superpowers/**',
      'docs/superpowers/**',
      '.yarn/**',
      '.nx/**',
      '**/node_modules/**',
      'packages/*/dist/**',
      'coverage/**',
      '**/*.tsbuildinfo',
      'packages/contract-types/src/abis/*Abi.json',
      'packages/contract-types/src/abis/*Abi.ts',
      'packages/contract-types/src/abis/index.ts',
      'packages/contract-types/src/types.ts',
      // Complete regression vectors retain bytes guarded by their hash manifest.
      'packages/math-utils/src/__fixtures__/math-regression-vectors.json',
      'packages/math-utils/src/__fixtures__/financial-regression-vectors.json',
      'packages/contract-helpers/src/__fixtures__/transaction-regression-vectors.json',
    ],
  },
  // XO's TypeScript-only entries are unscoped; keep its JS and JSON entries intact.
  ...xoTypescript.map(config => {
    if (config.language === 'json/json') {
      // The earlier JSONC entry owns compiler configs; generic JSON must not replace its language.
      return { ...config, ignores: ['**/tsconfig.json', '.vscode/*.json'] };
    }

    return config.files || config.language ? config : { ...config, files: typescriptFiles };
  }),
  {
    files: ['**/*.{js,cjs,mjs,ts}'],
    plugins: { import: importPlugin },
    languageOptions: { globals: globals.node },
    rules: {
      'import/order': ['error', { alphabetize: { order: 'asc' } }],
      'capitalized-comments': 'off',
    },
  },
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-restricted-types': 'off',
    },
  },
  {
    files: ['packages/*/src/**/*.test.ts'],
    languageOptions: { globals: globals.jest },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier,
];
