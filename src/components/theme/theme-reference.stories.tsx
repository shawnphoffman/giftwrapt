import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'

import { TooltipProvider } from '@/components/ui/tooltip'

import ListReference from './list-reference'
import ThemeReference from './theme-reference'

type TokenGroup = { category: string; tokens: Record<string, string> }

const lightTokens: Array<TokenGroup> = [
	{
		category: 'Surface',
		tokens: {
			background: 'oklch(1 0 0)',
			foreground: 'oklch(0.145 0 0)',
			card: 'oklch(1 0 0)',
			'card-foreground': 'oklch(0.145 0 0)',
			popover: 'oklch(1 0 0)',
			'popover-foreground': 'oklch(0.145 0 0)',
		},
	},
	{
		category: 'Brand',
		tokens: {
			primary: 'oklch(0.527 0.154 150.069)',
			'primary-foreground': 'oklch(0.982 0.018 155.826)',
			secondary: 'oklch(0.967 0.001 286.375)',
			'secondary-foreground': 'oklch(0.21 0.006 285.885)',
			accent: 'oklch(0.967 0.001 286.375)',
			'accent-foreground': 'oklch(0.21 0.006 285.885)',
		},
	},
	{
		category: 'Status',
		tokens: {
			muted: 'oklch(0.97 0 0)',
			'muted-foreground': 'oklch(0.556 0 0)',
			destructive: 'oklch(0.577 0.245 27.325)',
			'destructive-foreground': 'oklch(0.985 0 0)',
		},
	},
	{
		category: 'Form',
		tokens: {
			border: 'oklch(0.922 0 0)',
			input: 'oklch(0.922 0 0)',
			ring: 'oklch(0.708 0 0)',
		},
	},
	{
		category: 'Sidebar',
		tokens: {
			sidebar: 'oklch(0.985 0 0)',
			'sidebar-foreground': 'oklch(0.145 0 0)',
			'sidebar-primary': 'oklch(0.627 0.194 149.214)',
			'sidebar-primary-foreground': 'oklch(0.982 0.018 155.826)',
			'sidebar-accent': 'oklch(0.97 0 0)',
			'sidebar-accent-foreground': 'oklch(0.205 0 0)',
			'sidebar-border': 'oklch(0.922 0 0)',
			'sidebar-ring': 'oklch(0.708 0 0)',
		},
	},
	{
		category: 'Chart',
		tokens: {
			'chart-1': 'oklch(0.871 0.15 154.449)',
			'chart-2': 'oklch(0.723 0.219 149.579)',
			'chart-3': 'oklch(0.627 0.194 149.214)',
			'chart-4': 'oklch(0.527 0.154 150.069)',
			'chart-5': 'oklch(0.448 0.119 151.328)',
		},
	},
]

const darkTokens: Array<TokenGroup> = [
	{
		category: 'Surface',
		tokens: {
			background: 'oklch(0.145 0 0)',
			foreground: 'oklch(0.985 0 0)',
			card: 'oklch(0.205 0 0)',
			'card-foreground': 'oklch(0.985 0 0)',
			popover: 'oklch(0.205 0 0)',
			'popover-foreground': 'oklch(0.985 0 0)',
		},
	},
	{
		category: 'Brand',
		tokens: {
			primary: 'oklch(0.448 0.119 151.328)',
			'primary-foreground': 'oklch(0.982 0.018 155.826)',
			secondary: 'oklch(0.274 0.006 286.033)',
			'secondary-foreground': 'oklch(0.985 0 0)',
			accent: 'oklch(0.274 0.006 286.033)',
			'accent-foreground': 'oklch(0.985 0 0)',
		},
	},
	{
		category: 'Status',
		tokens: {
			muted: 'oklch(0.269 0 0)',
			'muted-foreground': 'oklch(0.708 0 0)',
			destructive: 'oklch(0.704 0.191 22.216)',
			'destructive-foreground': 'oklch(0.985 0 0)',
		},
	},
	{
		category: 'Form',
		tokens: {
			border: 'oklch(1 0 0 / 10%)',
			input: 'oklch(1 0 0 / 15%)',
			ring: 'oklch(0.556 0 0)',
		},
	},
	{
		category: 'Sidebar',
		tokens: {
			sidebar: 'oklch(0.205 0 0)',
			'sidebar-foreground': 'oklch(0.985 0 0)',
			'sidebar-primary': 'oklch(0.723 0.219 149.579)',
			'sidebar-primary-foreground': 'oklch(0.982 0.018 155.826)',
			'sidebar-accent': 'oklch(0.269 0 0)',
			'sidebar-accent-foreground': 'oklch(0.985 0 0)',
			'sidebar-border': 'oklch(1 0 0 / 10%)',
			'sidebar-ring': 'oklch(0.556 0 0)',
		},
	},
	{
		category: 'Chart',
		tokens: {
			'chart-1': 'oklch(0.871 0.15 154.449)',
			'chart-2': 'oklch(0.723 0.219 149.579)',
			'chart-3': 'oklch(0.627 0.194 149.214)',
			'chart-4': 'oklch(0.527 0.154 150.069)',
			'chart-5': 'oklch(0.448 0.119 151.328)',
		},
	},
]

function flatten(groups: Array<TokenGroup>) {
	const args: Record<string, string> = {}
	const argTypes: Record<string, { control: 'text'; table: { category: string } }> = {}
	for (const group of groups) {
		for (const [name, value] of Object.entries(group.tokens)) {
			args[name] = value
			argTypes[name] = { control: 'text', table: { category: group.category } }
		}
	}
	return { args, argTypes }
}

const lightConfig = flatten(lightTokens)
const darkConfig = flatten(darkTokens)

function tokensToStyle(args: Record<string, unknown>): CSSProperties {
	const style: Record<string, string> = {}
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === 'string' && value.trim() !== '') {
			style[`--${key}`] = value
		}
	}
	return style as CSSProperties
}

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

/**
 * Light theme playground. Each control is a text input; paste any oklch (or other
 * CSS color) value and the override is applied via inline `--<token>` variables on
 * a wrapper element. Defaults match `:root` in `src/styles.css`. Once you're happy
 * with the values, copy them into `styles.css`.
 */
export const LightPlayground: Story = {
	parameters: {
		themes: { themeOverride: 'light' },
	},
	args: lightConfig.args,
	argTypes: lightConfig.argTypes,
	render: args => (
		<div className="light bg-background text-foreground min-h-screen p-6" style={tokensToStyle(args)}>
			<ThemeReference />
		</div>
	),
}

/**
 * Dark theme playground. Same as `LightPlayground` but defaults match the `.dark`
 * block in `src/styles.css`.
 */
export const DarkPlayground: Story = {
	parameters: {
		themes: { themeOverride: 'dark' },
	},
	args: darkConfig.args,
	argTypes: darkConfig.argTypes,
	render: args => (
		<div className="dark bg-background text-foreground min-h-screen p-6" style={tokensToStyle(args)}>
			<ThemeReference />
		</div>
	),
}
