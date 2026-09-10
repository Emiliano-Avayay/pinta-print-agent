import js from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
export default [globalIgnores(['dist/**', 'installer/staging/**', 'node_modules/**', 'src/pinta_print_agent/**', 'tests/**/*.py']), js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['**/*.ts'],
  rules: { 'no-undef': 'off', '@typescript-eslint/no-explicit-any': 'error' }
}];
