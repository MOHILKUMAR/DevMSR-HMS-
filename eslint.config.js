import { defineConfig } from 'eslint/config';
import { baseConfig } from '@devmsr/config/eslint/base';

// Root files only (prisma/, prisma.config.ts). Each app and package has its own config.
export default defineConfig({ ignores: ['apps/**', 'packages/**', 'scripts/**'] }, baseConfig(import.meta.dirname));
