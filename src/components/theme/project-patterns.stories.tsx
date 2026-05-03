import type { Meta, StoryObj } from '@storybook/react-vite'

import { TooltipProvider } from '@/components/ui/tooltip'

import ProjectPatterns from './project-patterns'

const meta = {
	title: 'Utilities/Theme/Project Patterns',
	component: ProjectPatterns,
	parameters: {
		layout: 'fullscreen',
	},
	decorators: [
		Story => (
			<TooltipProvider>
				<Story />
			</TooltipProvider>
		),
	],
} satisfies Meta<typeof ProjectPatterns>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Project-specific styled primitives that recur across surfaces. Pairs with the
 * `Theme Reference` story (shadcn defaults) - this one focuses on the recurring
 * patterns the codebase invents on top of those defaults.
 */
export const Default: Story = {
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<ProjectPatterns />
		</div>
	),
}

/**
 * Light and dark side-by-side. Useful for confirming gradient and tonal pairs
 * survive the theme flip.
 */
export const SplitView: Story = {
	parameters: {
		themes: { disable: true },
	},
	render: () => (
		<div className="grid grid-cols-2 min-h-screen">
			<div className="light bg-background text-foreground p-6 border-r border-border">
				<div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 bg-background/90 backdrop-blur px-6 py-3 border-b border-border">
					<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Light</p>
				</div>
				<ProjectPatterns />
			</div>
			<div className="dark bg-background text-foreground p-6">
				<div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 bg-background/90 backdrop-blur px-6 py-3 border-b border-border">
					<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Dark</p>
				</div>
				<ProjectPatterns />
			</div>
		</div>
	),
}

export const LightOnly: Story = {
	parameters: {
		themes: { themeOverride: 'light' },
	},
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<ProjectPatterns />
		</div>
	),
}

export const DarkOnly: Story = {
	parameters: {
		themes: { themeOverride: 'dark' },
	},
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<ProjectPatterns />
		</div>
	),
}
