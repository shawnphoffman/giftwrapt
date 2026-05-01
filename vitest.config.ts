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
					exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'src/**/*.integration.test.ts'],
					// @t3-oss/env-core validates env at module load. Some unit tests
					// transitively import modules that touch `@/env`; supplying
					// synthetic values here keeps validation from blowing up
					// without giving tests anything real to talk to.
					env: {
						DATABASE_URL: 'postgres://test/test',
						BETTER_AUTH_SECRET: 'unit-test-secret',
						LOG_LEVEL: 'silent',
					},
				},
			},
			{
				extends: true,
				test: {
					name: 'integration',
					environment: 'node',
					include: ['src/**/__tests__/**/*.integration.test.ts'],
					setupFiles: ['./test/integration/setup.ts'],
					// Per-worker pglite migration runs on the first test in a
					// worker; the default 5s timeout is tight when the suite
					// is fanned out under heavy parallelism (test:all).
					testTimeout: 15_000,
					// Required env vars for the @t3-oss/env-core validator at module load.
					// Real values aren't used: @/db is mocked to pglite, no auth flows run.
					env: {
						DATABASE_URL: 'postgres://test/test',
						BETTER_AUTH_SECRET: 'integration-test-secret',
						// CRON_SECRET requires >=32 chars per env.ts validator.
						CRON_SECRET: 'integration-test-cron-secret-padding-x',
						LOG_LEVEL: 'silent',
					},
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
