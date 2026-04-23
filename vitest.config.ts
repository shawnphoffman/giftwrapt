import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

// Unit tests run in node; storybook interaction tests run against the stories
// in a real browser via playwright. They live in the same config via vitest
// projects so `pnpm test` runs both.
const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [
		viteTsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
	],
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{ts,tsx}'],
					exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
				},
			},
			{
				extends: true,
				plugins: [
					storybookTest({
						configDir: path.join(here, '.storybook'),
					}),
				],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						provider: 'playwright',
						headless: true,
						instances: [{ browser: 'chromium' }],
					},
					setupFiles: ['.storybook/vitest.setup.ts'],
				},
			},
		],
	},
})
