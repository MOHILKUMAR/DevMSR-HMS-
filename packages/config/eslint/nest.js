import { defineConfig } from 'eslint/config';
import { baseConfig } from './base.js';

/**
 * Rules for the NestJS API.
 * @param {string} tsconfigRootDir directory of the calling package
 */
export function nestConfig(tsconfigRootDir) {
  return defineConfig(baseConfig(tsconfigRootDir), {
    rules: {
      // Nest modules are empty classes that carry a decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  });
}
