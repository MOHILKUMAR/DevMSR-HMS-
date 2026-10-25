import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Strict, type-aware rules shared by every TypeScript package.
 * @param {string} tsconfigRootDir directory of the calling package
 */
export function baseConfig(tsconfigRootDir) {
  return defineConfig(
    {
      ignores: ['**/dist/**', '**/.spec-build/**', '**/.next/**', '**/coverage/**', '**/generated/**', '**/next-env.d.ts'],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        // `const { secret, ...rest } = row` is the plain way to drop a field.
        '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
        // Logs must go through pino so patient fields are redacted.
        'no-console': 'error',
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tseslint.configs.disableTypeChecked],
    },
  );
}
