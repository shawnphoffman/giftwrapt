import type { StorybookConfig } from '@storybook/react-vite'
import type { UserConfig as ViteUserConfig } from 'vite'

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
		return cfg
	},
}
export default config
