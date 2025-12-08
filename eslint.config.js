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
		ignores: ['eslint.config.js', 'prettier.config.js', '.output/**', 'dist/**', 'build/**', 'src/components/ui/**'],
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
]
