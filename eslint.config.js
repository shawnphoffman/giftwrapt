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
		ignores: ['eslint.config.js'],
	},
	{
		ignores: ['src/components/ui/**'],
		plugins: {
			'simple-import-sort': simpleImportSort,
		},
		rules: {
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			'import/order': 'off', // Disable in favor of simple-import-sort
			'import/first': 'error',
			'import/newline-after-import': 'error',
			'import/no-duplicates': 'error',
			'sort-imports': 'off',
		},
	},
]
