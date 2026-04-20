import type { Meta, StoryObj } from '@storybook/react-vite'

import { TooltipProvider } from '@/components/ui/tooltip'

import ListReference from './list-reference'
import ThemeReference from './theme-reference'

const meta = {
	title: 'Theme/Theme Reference',
	component: ThemeReference,
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
} satisfies Meta<typeof ThemeReference>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Renders the full theme reference. Use the Storybook theme toggle in the toolbar
 * to flip between light and dark. For a simultaneous comparison use `Split View`.
 */
export const Default: Story = {
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<ThemeReference />
		</div>
	),
}

/**
 * Light and dark themes side-by-side. The left column uses the default `:root` tokens;
 * the right column scopes `.dark` to its subtree so both render at the same time.
 *
 * Overlay components (Tooltip, Popover, Dialog, etc.) portal to `document.body` and
 * inherit whichever theme class Storybook has set on the root, so they won't match
 * the half they were opened from. Use `Default` with the toolbar toggle for those.
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
				<ThemeReference />
			</div>
			<div className="dark bg-background text-foreground p-6">
				<div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 bg-background/90 backdrop-blur px-6 py-3 border-b border-border">
					<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Dark</p>
				</div>
				<ThemeReference />
			</div>
		</div>
	),
}

export const ListSplitView: Story = {
	parameters: {
		themes: { disable: true },
	},
	render: () => (
		<div className="grid grid-cols-2 min-h-screen">
			<div className="light bg-background text-foreground p-6 border-r border-border">
				<div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 bg-background/90 backdrop-blur px-6 py-3 border-b border-border">
					<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Light</p>
				</div>
				<ListReference />
			</div>
			<div className="dark bg-background text-foreground p-6">
				<div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 bg-background/90 backdrop-blur px-6 py-3 border-b border-border">
					<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Dark</p>
				</div>
				<ListReference />
			</div>
		</div>
	),
}

/**
 * Light theme forced, regardless of the toolbar toggle. Useful for screenshots or A/B checks.
 */
export const LightOnly: Story = {
	parameters: {
		themes: { themeOverride: 'light' },
	},
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<ThemeReference />
		</div>
	),
}

/**
 * Dark theme forced, regardless of the toolbar toggle.
 */
export const DarkOnly: Story = {
	parameters: {
		themes: { themeOverride: 'dark' },
	},
	render: () => (
		<div className="bg-background text-foreground min-h-screen p-6">
			<ThemeReference />
		</div>
	),
}
