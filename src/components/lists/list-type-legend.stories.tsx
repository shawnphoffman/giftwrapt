import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { appSettingsQueryKey } from '@/hooks/use-app-settings'
import { type AppSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { ListTypeLegend } from './list-type-legend'

// Controls panel exposes each admin list-type toggle as a boolean. The
// wrapper component primes a stable QueryClient with the toggled
// settings and re-runs setQueryData on every args change so React Query
// notifies its subscribers. Recreating the client per arg-change broke
// useQuery's observer subscriptions and the legend never re-rendered.

type Args = {
	enableBirthdayLists: boolean
	enableChristmasLists: boolean
	enableGenericHolidayLists: boolean
	enableTodoLists: boolean
	className?: string
}

function SettingsHydrator({ settings, children }: { settings: AppSettings; children: ReactNode }) {
	const client = useQueryClient()
	// Seed synchronously on first render so the first paint has the
	// requested settings; refresh on subsequent renders when args change.
	const [hydrated, setHydrated] = useState(() => {
		client.setQueryData(appSettingsQueryKey, settings)
		return true
	})
	useEffect(() => {
		client.setQueryData(appSettingsQueryKey, settings)
		setHydrated(true)
	}, [client, settings])
	return hydrated ? <>{children}</> : null
}

function ListTypeLegendWithSettings({
	enableBirthdayLists,
	enableChristmasLists,
	enableGenericHolidayLists,
	enableTodoLists,
	className,
}: Args) {
	const client = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }), [])
	const settings = useMemo<AppSettings>(
		() => ({
			...DEFAULT_APP_SETTINGS,
			enableBirthdayLists,
			enableChristmasLists,
			enableGenericHolidayLists,
			enableTodoLists,
		}),
		[enableBirthdayLists, enableChristmasLists, enableGenericHolidayLists, enableTodoLists]
	)

	return (
		<QueryClientProvider client={client}>
			<SettingsHydrator settings={settings}>
				<ListTypeLegend className={className} />
			</SettingsHydrator>
		</QueryClientProvider>
	)
}

const meta = {
	title: 'Lists/ListTypeLegend',
	component: ListTypeLegendWithSettings,
	parameters: { layout: 'padded' },
	args: {
		enableBirthdayLists: true,
		enableChristmasLists: true,
		enableGenericHolidayLists: true,
		enableTodoLists: true,
	},
	argTypes: {
		enableBirthdayLists: { control: 'boolean', description: 'Admin toggle for birthday lists' },
		enableChristmasLists: { control: 'boolean', description: 'Admin toggle for christmas lists' },
		enableGenericHolidayLists: { control: 'boolean', description: 'Admin toggle for generic holiday lists' },
		enableTodoLists: { control: 'boolean', description: 'Admin toggle for todo lists' },
		className: { control: 'text', description: 'Optional class merged onto the trigger button' },
	},
} satisfies Meta<typeof ListTypeLegendWithSettings>

export default meta
type Story = StoryObj<typeof meta>

// The modal renders into a portal, so play() functions must query
// document.body (via `within(document.body)`) for content; the trigger
// stays inside `canvasElement`.

export const Closed: Story = {
	parameters: {
		docs: {
			description: {
				story: 'Default state: just the trigger. Toggle any setting in the Controls panel, then click the trigger to inspect.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByRole('button', { name: /what do the list types mean/i })).toBeInTheDocument()
		// Modal content not in the DOM until opened.
		await expect(within(document.body).queryByText(/Anchored to your birthday/i)).not.toBeInTheDocument()
	},
}

export const Open: Story = {
	parameters: {
		docs: {
			description: { story: 'All toggles enabled (default). Open the modal; every gated section should appear with its four sub-fields.' },
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: /what do the list types mean/i }))
		const body = within(document.body)
		await expect(await body.findByRole('dialog')).toBeInTheDocument()
		await expect(body.getByText('Wishlist')).toBeInTheDocument()
		await expect(body.getByText('Birthday')).toBeInTheDocument()
		await expect(body.getByText('Christmas')).toBeInTheDocument()
		await expect(body.getByText('Holiday')).toBeInTheDocument()
		await expect(body.getByText('Gift Ideas')).toBeInTheDocument()
		await expect(body.getByText('Todos')).toBeInTheDocument()
		// Each entry renders the four labelled sub-fields. Spot-check the
		// per-section dt count.
		const overviews = body.getAllByText('Overview')
		await expect(overviews.length).toBe(6)
	},
}

export const NoChristmasOrTodos: Story = {
	args: { enableChristmasLists: false, enableTodoLists: false },
	parameters: {
		docs: {
			description: {
				story: 'Christmas and Todos disabled by the admin. Those sections drop out; users only see types they can actually create.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: /what do the list types mean/i }))
		const body = within(document.body)
		await expect(await body.findByRole('dialog')).toBeInTheDocument()
		await expect(body.queryByText('Christmas')).not.toBeInTheDocument()
		await expect(body.queryByText('Todos')).not.toBeInTheDocument()
		await expect(body.getByText('Wishlist')).toBeInTheDocument()
		await expect(body.getByText('Birthday')).toBeInTheDocument()
		await expect(body.getByText('Holiday')).toBeInTheDocument()
		await expect(body.getByText('Gift Ideas')).toBeInTheDocument()
	},
}

export const MinimalDeployment: Story = {
	args: {
		enableBirthdayLists: false,
		enableChristmasLists: false,
		enableGenericHolidayLists: false,
		enableTodoLists: false,
	},
	parameters: {
		docs: {
			description: {
				story: 'Every gated type is off. Only the always-on sections (Wishlist + Gift Ideas) remain.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: /what do the list types mean/i }))
		const body = within(document.body)
		await expect(await body.findByRole('dialog')).toBeInTheDocument()
		await expect(body.getByText('Wishlist')).toBeInTheDocument()
		await expect(body.getByText('Gift Ideas')).toBeInTheDocument()
		await expect(body.queryByText('Birthday')).not.toBeInTheDocument()
		await expect(body.queryByText('Christmas')).not.toBeInTheDocument()
		await expect(body.queryByText('Holiday')).not.toBeInTheDocument()
		await expect(body.queryByText('Todos')).not.toBeInTheDocument()
	},
}

export const Playground: Story = {
	parameters: {
		docs: {
			description: {
				story:
					'Interactive playground - flip each enable toggle in the Controls panel and reopen the modal to verify the matching subset of sections renders.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: /what do the list types mean/i }))
	},
}
