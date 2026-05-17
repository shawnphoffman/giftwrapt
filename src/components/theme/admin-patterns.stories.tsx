import type { Meta, StoryObj } from '@storybook/react-vite'

import { TooltipProvider } from '@/components/ui/tooltip'

import AdminPatterns from './admin-patterns'

const meta = {
	title: 'Utilities/Theme/Admin Patterns',
	component: AdminPatterns,
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
} satisfies Meta<typeof AdminPatterns>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Inventory of every recurring shape on the `/admin/*` and `/settings/*`
 * routes. Use this story when proposing a unified design for those
 * surfaces - every existing pattern lives here in one place so it's easy
 * to compare and pick a canonical form.
 */
export const Default: Story = {
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<AdminPatterns />
		</div>
	),
}

/**
 * Light and dark side-by-side. Useful for confirming tonal pairs and
 * Alert colors survive the theme flip.
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
				<AdminPatterns />
			</div>
			<div className="dark bg-background text-foreground p-6">
				<div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 bg-background/90 backdrop-blur px-6 py-3 border-b border-border">
					<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Dark</p>
				</div>
				<AdminPatterns />
			</div>
		</div>
	),
}
