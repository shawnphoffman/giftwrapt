import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import type { AiConfigResponse, AiSlotResponse } from '@/api/admin-ai'

import { AiSlotCard } from './ai-slot-card'

const main: AiConfigResponse = {
	providerType: { source: 'db', value: 'anthropic' },
	baseUrl: { source: 'missing' },
	apiKey: { source: 'db', preview: 'sk-••••a1b2' },
	model: { source: 'db', value: 'claude-opus-5-5' },
	maxOutputTokens: { source: 'default', value: 4096 },
	envLocked: { providerType: false, baseUrl: false, apiKey: false, model: false, maxOutputTokens: false },
	isValid: true,
}

const empty: AiSlotResponse = {
	slot: 'fast',
	mode: 'inherited',
	providerType: { source: 'missing' },
	baseUrl: { source: 'missing' },
	apiKey: { source: 'missing' },
	model: { source: 'missing' },
	envLocked: { providerType: false, baseUrl: false, apiKey: false, model: false },
}

/**
 * One optional model slot on /admin/ai (plan 34). A slot is empty (it
 * follows the default), a model on the default provider, or a model on a
 * provider of its own.
 */
const meta = {
	title: 'Admin/AiSlotCard',
	component: AiSlotCard,
	parameters: { layout: 'padded' },
	args: {
		slot: 'fast',
		title: 'Fast Model',
		description: 'Optional. A smaller, cheaper model for mechanical work that runs often.',
		features: ['Clean Imported Titles', 'Clean Up Barcode Results', 'Paste Text to Items', 'Suggestions (parts of it)'],
		config: empty,
		main,
		saving: false,
		onSave: fn(),
		onTest: fn(() => Promise.resolve({ ok: true as const, latencyMs: 412 })),
		models: [
			{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
			{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
			{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
		],
		modelsStatus: { kind: 'live', count: 3, fetchedAt: Date.now() - 60_000 },
		onRefreshModels: fn(),
		rate: { isKnown: (model: string) => /haiku|sonnet|opus/i.test(model), valueFor: () => undefined, pending: false, onSave: fn() },
	},
	decorators: [
		Story => (
			<div className="max-w-2xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof AiSlotCard>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing set: the slot's features run on the default model. */
export const Empty: Story = {}

/** A model name only. Provider and key come from the default. */
export const ModelOnly: Story = {
	args: { config: { ...empty, mode: 'model', model: { source: 'db', value: 'claude-haiku-5-5' } } },
}

/** The vision slot on another provider with its own key. */
export const OwnProvider: Story = {
	args: {
		slot: 'vision',
		title: 'Vision Model',
		description: 'Optional. A model that reads images, for features that send a photo.',
		features: ['Photo to Item'],
		config: {
			slot: 'vision',
			mode: 'provider',
			providerType: { source: 'db', value: 'openai' },
			baseUrl: { source: 'missing' },
			apiKey: { source: 'db', preview: 'sk-••••9z8y' },
			model: { source: 'db', value: 'gpt-5-mini' },
			envLocked: { providerType: false, baseUrl: false, apiKey: false, model: false },
		},
		models: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }],
		modelsStatus: { kind: 'live', count: 2, fetchedAt: Date.now() - 60_000 },
	},
}

/** A model the built-in price list does not know shows the optional price fields. */
export const UnknownPrice: Story = {
	args: { config: { ...empty, mode: 'model', model: { source: 'db', value: 'some-new-model' } } },
}

/** Set through AI_FAST_* environment variables: read-only here. */
export const EnvLocked: Story = {
	args: {
		config: {
			...empty,
			mode: 'model',
			model: { source: 'env', value: 'claude-haiku-5-5' },
			envLocked: { providerType: false, baseUrl: false, apiKey: false, model: true },
		},
	},
}

/** A provider named in the environment without its key: the features fall back to the default model. */
export const Incomplete: Story = {
	args: {
		config: {
			...empty,
			mode: 'misconfigured',
			providerType: { source: 'env', value: 'openai' },
			model: { source: 'env', value: 'gpt-5-mini' },
			envLocked: { providerType: true, baseUrl: false, apiKey: false, model: true },
		},
	},
}

export const Saving: Story = {
	args: { saving: true, config: { ...empty, mode: 'model', model: { source: 'db', value: 'claude-haiku-5-5' } } },
}
