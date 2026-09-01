// @ts-check
import storybook from 'eslint-plugin-storybook'
import { tanstackConfig } from '@tanstack/eslint-config'
import prettierConfig from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

export default [
	...tanstackConfig,
	prettierConfig,
	...storybook.configs['flat/recommended'],
	{
		ignores: [
			'eslint.config.js',
			'prettier.config.js',
			'commitlint.config.js',
			'lint-staged.config.js',
			'.output/**',
			'dist/**',
			'build/**',
			'storybook-static/**',
			'src/components/ui/**',
			'src/db/schema/temp/**',
			'_NOTES_/**',
			// Local-only personal notes; never participates in the build.
			'.notes.local/**',
		],
	},
	{
		// ignores: ['src/components/ui/**'],
		plugins: {
			'simple-import-sort': simpleImportSort,
		},
		rules: {
			// Use simple-import-sort for sorting (primary)
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			// Disable all conflicting sorting rules
			'import/order': 'off',
			'sort-imports': 'off',
			// Disable import plugin rules that conflict with simple-import-sort
			'import/first': 'off',
			'import/newline-after-import': 'off',
			'import/no-duplicates': 'off',
			'import/consistent-type-specifier-style': 'off',
		},
	},
	{
		// Test doubles have to match the shape of what they replace, and a
		// lot of what we mock is promise-returning: `generateObject`, a
		// provider's `lookup`, `dns.lookup`, the AI SDK's `doGenerate`. Those
		// mocks are `async` to satisfy the signature, not because they await
		// anything, and `require-await` only reads the function body so it
		// can't tell the difference. Rewriting them as `() => Promise.resolve(...)`
		// would satisfy the rule and read worse. The rule flags style, not
		// missing awaits - `no-floating-promises` and `await-thenable` catch
		// those, and both stay on here.
		files: ['**/__tests__/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}', 'test/**/*.{ts,tsx}'],
		rules: {
			'@typescript-eslint/require-await': 'off',
		},
	},
]
