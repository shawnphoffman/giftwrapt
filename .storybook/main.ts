import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
	addons: ['@storybook/addon-a11y', '@storybook/addon-themes'],
	// '@storybook/addon-docs',
	framework: {
		name: '@storybook/react-vite',
		options: {},
	},
	staticDirs: ['../public'],
	async viteFinal(config) {
		const { default: tailwindcss } = await import('@tailwindcss/vite')
		config.plugins = config.plugins || []
		config.plugins.push(tailwindcss())
		return config
	},
}
export default config
