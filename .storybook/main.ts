import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { StorybookConfig } from '@storybook/react-vite'
import type { UserConfig as ViteUserConfig } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..', 'src')
const mocksDir = path.resolve(here, 'mocks')

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
	addons: ['@storybook/addon-a11y', '@storybook/addon-themes'],
	// '@storybook/addon-docs',
	framework: {
		name: '@storybook/react-vite',
		options: {},
	},
	staticDirs: ['../public'],
	async viteFinal(cfg: ViteUserConfig) {
		const { default: tailwindcss } = await import('@tailwindcss/vite')
		cfg.plugins = cfg.plugins || []
		cfg.plugins.push(tailwindcss())
		cfg.resolve = cfg.resolve || {}
		cfg.resolve.alias = {
			...(cfg.resolve.alias || {}),
			// Swap server/IO modules for browser-safe stubs so components that
			// import them for their server actions (`createServerFn`) don't pull
			// the database or env validation into the Storybook bundle.
			'@/api/items': path.join(mocksDir, 'api.ts'),
			'@/api/groups': path.join(mocksDir, 'api.ts'),
			'@/api/gifts': path.join(mocksDir, 'api.ts'),
			'@/api/comments': path.join(mocksDir, 'api.ts'),
			'@/api/user': path.join(mocksDir, 'api.ts'),
			'@/api/lists': path.join(mocksDir, 'api.ts'),
			'@/api/purchases': path.join(mocksDir, 'api.ts'),
			'@/api/list-addons': path.join(mocksDir, 'api.ts'),
			'@/api/uploads': path.join(mocksDir, 'api.ts'),
			'@/api/storage-status': path.join(mocksDir, 'api.ts'),
			'@/lib/auth-client': path.join(mocksDir, 'auth-client.ts'),
			'@/env': path.join(mocksDir, 'env.ts'),
			// Base `@/` alias for everything else — the Vite preset Storybook uses
			// doesn't read `tsconfig.json` paths.
			'@': srcDir,
		}
		return cfg
	},
}
export default config
