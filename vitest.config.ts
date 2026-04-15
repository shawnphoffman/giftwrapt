import { defineConfig } from 'vitest/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

// Dedicated vitest config, independent of vite.config.ts.
// We skip the tanstackStart / nitro / react plugins here because unit tests
// shouldn't go through the SSR/route transform pipeline — they're faster and
// more predictable without it. When we later want component tests, we can add
// viteReact and switch environment to jsdom per-project or per-file.
export default defineConfig({
	plugins: [
		viteTsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
	],
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
	},
})
