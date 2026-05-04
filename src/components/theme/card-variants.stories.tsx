import type { Meta, StoryObj } from '@storybook/react-vite'

import { TooltipProvider } from '@/components/ui/tooltip'

import CardVariants from './card-variants'

const meta = {
	title: 'Utilities/Theme/Card Variants',
	component: CardVariants,
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
} satisfies Meta<typeof CardVariants>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Six canonical Card shapes plus the outliers in the codebase that don't fit
 * any of them. Pairs with the `Project Patterns` story (which still hosts the
 * same six variants alongside the rest of the project's bespoke primitives).
 */
export const Default: Story = {
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<CardVariants />
		</div>
	),
}

/**
 * Light and dark side-by-side. Useful for confirming the gradient and tonal
 * variants survive the theme flip.
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
				<CardVariants />
			</div>
			<div className="dark bg-background text-foreground p-6">
				<div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 bg-background/90 backdrop-blur px-6 py-3 border-b border-border">
					<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Dark</p>
				</div>
				<CardVariants />
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
			<CardVariants />
		</div>
	),
}

export const DarkOnly: Story = {
	parameters: {
		themes: { themeOverride: 'dark' },
	},
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<CardVariants />
		</div>
	),
}
