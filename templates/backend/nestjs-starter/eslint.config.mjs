// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Formatting is deliberately not linted: the starter keeps long lines and
// one-line classes on purpose, so Prettier is not wired in as a lint rule.
export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Unit and e2e tests drive the application through Jest mocks, fake fetch
    // implementations and partial repositories. These rules flag the test
    // doubles themselves rather than defects in the code under test:
    // - no-unsafe-* / no-explicit-any: jest.fn() mocks and mock.calls are `any`.
    // - require-await: async mocks only exist to satisfy Promise-returning signatures.
    // - unbound-method: expect(mock.method).toHaveBeenCalled() never invokes the method.
    // - only-throw-error: tests throw driver-shaped objects such as { code: '23505' }.
    // - no-base-to-string: fetch mocks receive string URLs typed as string | URL | Request.
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);
