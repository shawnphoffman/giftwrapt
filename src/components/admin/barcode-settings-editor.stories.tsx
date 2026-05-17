import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { adminAppSettingsQueryKey } from '@/hooks/use-app-settings'
import { type AppSettings, type BarcodeSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { BarcodeSettingsEditor } from './barcode-settings-editor'

const meta = {
	title: 'Admin/BarcodeSettingsEditor',
	component: BarcodeSettingsEditor,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof BarcodeSettingsEditor>

export default meta
type Story = StoryObj<typeof meta>

function withSettings(barcode: BarcodeSettings): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, barcode }
		client.setQueryData(adminAppSettingsQueryKey, settings)
		return (
			<QueryClientProvider client={client}>
				<div className="max-w-2xl">
					<Story />
				</div>
			</QueryClientProvider>
		)
	}
}

export const Disabled: Story = {
	decorators: [
		withSettings({
			enabled: false,
			providerId: 'upcitemdb-trial',
			goUpcKey: '',
			cacheTtlHours: 720,
		}),
	],
	parameters: {
		docs: {
			description: {
				story:
					'Default deployment state: feature off, UPCitemdb (trial, free) selected. The mobile endpoint returns 503 barcode-disabled until an admin flips the switch.',
			},
		},
	},
}

export const UpcItemDbEnabled: Story = {
	decorators: [
		withSettings({
			enabled: true,
			providerId: 'upcitemdb-trial',
			goUpcKey: '',
			cacheTtlHours: 720,
		}),
	],
	parameters: {
		docs: {
			description: {
				story: 'Trial provider enabled. No API key is needed for UPCitemdb trial; the Go-UPC key field is hidden.',
			},
		},
	},
}

export const GoUpcEnabledWithKey: Story = {
	decorators: [
		withSettings({
			enabled: true,
			providerId: 'go-upc',
			goUpcKey: 'goupc_live_xxxxxxxxxxxxxxxxxxxxx',
			cacheTtlHours: 24,
		}),
	],
	parameters: {
		docs: {
			description: {
				story:
					'Paid Go-UPC provider enabled with a key set. The key is masked; Change / Clear actions are exposed inline. The Save Key flow encrypts at the storage boundary.',
			},
		},
	},
}

export const GoUpcEnabledMissingKey: Story = {
	decorators: [
		withSettings({
			enabled: true,
			providerId: 'go-upc',
			goUpcKey: '',
			cacheTtlHours: 720,
		}),
	],
	parameters: {
		docs: {
			description: {
				story:
					'Misconfigured state: Go-UPC selected but no key set. The amber warning makes it obvious that lookups will return 503 until a key is provided.',
			},
		},
	},
}

export const CachingDisabled: Story = {
	decorators: [
		withSettings({
			enabled: true,
			providerId: 'upcitemdb-trial',
			goUpcKey: '',
			cacheTtlHours: 0,
		}),
	],
	parameters: {
		docs: {
			description: {
				story: 'TTL of 0 disables caching; every lookup re-hits the provider. Useful while diagnosing provider mapping issues.',
			},
		},
	},
}
