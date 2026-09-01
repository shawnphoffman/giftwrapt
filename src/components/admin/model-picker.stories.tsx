import type { Meta, StoryObj } from '@storybook/react-vite'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CUSTOM_PROVIDER_ID, PROVIDERS } from '@/lib/ai-provider-catalog'
import type { ProviderModel } from '@/lib/ai-types'

import { ModelPicker, type ModelPickerStatus } from './model-picker'

/**
 * Model chooser for the admin AI settings page. The list is pulled live from
 * the configured provider's `/models` endpoint (cached an hour, refreshable),
 * so new models show up without a redeploy. The hardcoded list still backs it
 * up when the provider can't be reached, and the currently-saved model is
 * always selectable even if it has dropped off the provider's catalogue.
 *
 * The first story wires the real provider dropdown to a faked catalogue so the
 * whole interaction can be driven here: switch providers, watch the list
 * reload, refresh it, or type an id the provider never advertised.
 */
const meta = {
	title: 'Admin/Model Picker',
	component: ModelPicker,
	parameters: { layout: 'padded' },
	argTypes: {
		onChange: { action: 'changed' },
		onRefresh: { action: 'refreshed' },
	},
} satisfies Meta<typeof ModelPicker>

export default meta
type Story = StoryObj<typeof meta>

// ===============================
// Faked provider catalogues
// ===============================

function models(...ids: Array<string | [string, string]>): Array<ProviderModel> {
	return ids.map(entry => (typeof entry === 'string' ? { id: entry } : { id: entry[0], label: entry[1] }))
}

const anthropicModels = models(
	['claude-opus-5', 'Claude Opus 5'],
	['claude-sonnet-5', 'Claude Sonnet 5'],
	['claude-opus-4-7', 'Claude Opus 4.7'],
	['claude-sonnet-4-6', 'Claude Sonnet 4.6'],
	['claude-haiku-4-5-20251001', 'Claude Haiku 4.5'],
	['claude-3-7-sonnet-20250219', 'Claude Sonnet 3.7'],
	['claude-3-5-haiku-20241022', 'Claude Haiku 3.5']
)

const openRouterModels: Array<ProviderModel> = [
	...models(
		['anthropic/claude-opus-5', 'Anthropic: Claude Opus 5'],
		['anthropic/claude-sonnet-5', 'Anthropic: Claude Sonnet 5'],
		['openai/gpt-5', 'OpenAI: GPT-5'],
		['openai/gpt-5-mini', 'OpenAI: GPT-5 Mini'],
		['google/gemini-3-pro', 'Google: Gemini 3 Pro'],
		['meta-llama/llama-4-maverick', 'Meta: Llama 4 Maverick'],
		['deepseek/deepseek-v3', 'DeepSeek: DeepSeek V3'],
		['qwen/qwen3-235b-instruct', 'Qwen: Qwen3 235B Instruct'],
		['mistralai/mistral-large-2411', 'Mistral: Large 2411'],
		['x-ai/grok-4', 'xAI: Grok 4']
	),
	// OpenRouter really does list a few hundred; the bulk is here to prove the
	// search box earns its place.
	...Array.from({ length: 240 }, (_, i) => ({ id: `vendor-${i}/model-${i}`, label: `Vendor ${i}: Model ${i}` })),
]

// Keyed by provider id. A provider missing from this map stands in for an
// endpoint that can't be reached (nothing listening on the localhost ones).
const CATALOGUES: Record<string, Array<ProviderModel>> = {
	openai: models(
		'gpt-5.2',
		'gpt-5.2-mini',
		'gpt-5',
		'gpt-5-mini',
		'gpt-4.1',
		'gpt-4.1-mini',
		'gpt-4o',
		'gpt-4o-mini',
		'o4-mini',
		'o3',
		'o3-mini'
	),
	anthropic: anthropicModels,
	openrouter: openRouterModels,
	groq: models('llama-4-scout-17b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen3-32b'),
	together: models('meta-llama/Llama-4-Maverick-17B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen3-235B-Instruct'),
	mistral: models('mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest', 'magistral-medium-latest'),
	deepseek: models('deepseek-chat', 'deepseek-reasoner'),
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ===============================
// Interactive playground
// ===============================

type PlaygroundArgs = {
	hasApiKey: boolean
	latencyMs: number
	/** Force the failure path for every provider, as a bad key would. */
	unauthorized: boolean
	onChange: (model: string) => void
	onRefresh: () => void
}

function Playground({ hasApiKey, latencyMs, unauthorized, onChange, onRefresh }: PlaygroundArgs) {
	const [providerId, setProviderId] = useState('anthropic')
	const [model, setModel] = useState('claude-sonnet-4-6')
	const [liveModels, setLiveModels] = useState<Array<ProviderModel>>([])
	const [status, setStatus] = useState<ModelPickerStatus>({ kind: 'idle' })
	const awaitingLiveDefault = useRef(false)

	const provider = PROVIDERS.find(p => p.id === providerId)
	const providerName = providerId === CUSTOM_PROVIDER_ID ? 'this endpoint' : (provider?.name ?? 'this endpoint')
	const fallbackModels = provider?.models ?? []

	const load = useCallback(
		async (signal: { cancelled: boolean }) => {
			if (!hasApiKey) {
				setLiveModels([])
				setStatus({ kind: 'idle' })
				return
			}
			setStatus({ kind: 'loading' })
			await sleep(latencyMs)
			if (signal.cancelled) return

			const catalogue = unauthorized ? undefined : CATALOGUES[providerId]
			if (!catalogue) {
				setLiveModels([])
				setStatus({ kind: 'error', error: unauthorized ? '401 Unauthorized' : 'fetch failed: connection refused' })
				return
			}
			setLiveModels(catalogue)
			setStatus({ kind: 'live', count: catalogue.length, fetchedAt: Date.now() })
			// A provider switch parks on the curated first model until the live
			// catalogue lands, then upgrades to the newest model it offers.
			if (awaitingLiveDefault.current) setModel(catalogue[0].id)
			awaitingLiveDefault.current = false
		},
		[providerId, hasApiKey, latencyMs, unauthorized]
	)

	useEffect(() => {
		const signal = { cancelled: false }
		void load(signal)
		return () => {
			signal.cancelled = true
		}
	}, [load])

	const handleProviderChange = (id: string) => {
		setProviderId(id)
		setModel(PROVIDERS.find(p => p.id === id)?.models[0] ?? '')
		awaitingLiveDefault.current = id !== CUSTOM_PROVIDER_ID
	}

	return (
		<div className="flex max-w-xl flex-col gap-6">
			<div className="flex flex-col gap-2">
				<div className="space-y-0.5">
					<Label htmlFor="aiProvider" className="text-base">
						Provider
					</Label>
					<p className="text-sm text-muted-foreground">
						Pick OpenAI, Anthropic, a known OpenAI-compatible provider, or Custom to point at any other endpoint.
					</p>
				</div>
				<Select value={providerId} onValueChange={handleProviderChange}>
					<SelectTrigger id="aiProvider" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PROVIDERS.map(p => (
							<SelectItem key={p.id} value={p.id}>
								{p.name}
							</SelectItem>
						))}
						<SelectItem value={CUSTOM_PROVIDER_ID}>Custom…</SelectItem>
					</SelectContent>
				</Select>
				{provider?.baseUrl && <p className="font-mono text-xs text-muted-foreground">{provider.baseUrl}</p>}
			</div>

			<div className="flex flex-col gap-2">
				<div className="space-y-0.5">
					<Label htmlFor="aiModel" className="text-base">
						Model
					</Label>
					<p className="text-sm text-muted-foreground">Pick a model this provider currently offers, or type any identifier it accepts.</p>
				</div>
				<ModelPicker
					// Remounting on a provider switch closes the popover and clears its search.
					key={providerId}
					id="aiModel"
					value={model}
					onChange={m => {
						setModel(m)
						awaitingLiveDefault.current = false
						onChange(m)
					}}
					models={liveModels}
					fallbackModels={fallbackModels}
					providerName={providerName}
					status={status}
					catalogue={providerId !== CUSTOM_PROVIDER_ID}
					onRefresh={() => {
						onRefresh()
						void load({ cancelled: false })
					}}
				/>
			</div>
		</div>
	)
}

export const Interactive: StoryObj<{ args: PlaygroundArgs }> = {
	args: {
		hasApiKey: true,
		latencyMs: 500,
		unauthorized: false,
		onChange: () => undefined,
		onRefresh: () => undefined,
	},
	argTypes: {
		hasApiKey: { control: 'boolean', description: 'An API key is saved, so the catalogue can be fetched at all.' },
		latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } },
		unauthorized: { control: 'boolean', description: 'Simulate a rejected key so every provider falls back to its known models.' },
	},
	render: args => <Playground {...(args as unknown as PlaygroundArgs)} />,
	parameters: {
		docs: {
			description: {
				story:
					'The real provider dropdown against faked catalogues. Switching providers reloads the model list and resets the model; Ollama and LM Studio stand in for an endpoint that is not running. Toggle the controls to see the no-key and rejected-key paths.',
			},
		},
	},
}

// ===============================
// Individual states
// ===============================

function Single(props: React.ComponentProps<typeof ModelPicker>) {
	const [value, setValue] = useState(props.value)
	return (
		<div className="max-w-xl space-y-2">
			<Label htmlFor="aiModel" className="text-base">
				Model
			</Label>
			<p className="text-sm text-muted-foreground">Pick a model this provider currently offers, or type any identifier it accepts.</p>
			<ModelPicker
				{...props}
				id="aiModel"
				value={value}
				onChange={m => {
					setValue(m)
					props.onChange(m)
				}}
			/>
		</div>
	)
}

const anthropicFallback = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']

export const LiveCatalogue: Story = {
	args: {
		value: 'claude-sonnet-4-6',
		models: anthropicModels,
		fallbackModels: anthropicFallback,
		providerName: 'Anthropic',
		status: { kind: 'live', count: anthropicModels.length, fetchedAt: Date.now() - 90_000 },
		onChange: () => undefined,
		onRefresh: () => undefined,
	},
	render: args => <Single {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					'The happy path. Models come straight from the provider, newest first, with the provider’s own display names alongside the ids that actually get saved.',
			},
		},
	},
}

export const NoApiKeyYet: Story = {
	args: { ...LiveCatalogue.args, value: '', models: [], status: { kind: 'idle' } },
	render: args => <Single {...args} />,
	parameters: {
		docs: { description: { story: 'First-time setup. Nothing to list until a key exists, so the curated list is all that shows.' } },
	},
}

export const Loading: Story = {
	args: { ...LiveCatalogue.args, models: [], status: { kind: 'loading' } },
	render: args => <Single {...args} />,
}

export const ProviderUnreachable: Story = {
	args: { ...LiveCatalogue.args, models: [], status: { kind: 'error', error: '401 Unauthorized' } },
	render: args => <Single {...args} />,
	parameters: {
		docs: {
			description: { story: 'Bad key, network trouble, or a self-hosted endpoint that is down. The hardcoded list keeps the form usable.' },
		},
	},
}

export const RetiredModelStillSelected: Story = {
	args: {
		...LiveCatalogue.args,
		value: 'claude-3-opus-20240229',
		status: { kind: 'live', count: anthropicModels.length, fetchedAt: Date.now() - 3_600_000 },
	},
	render: args => <Single {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					'The saved model is no longer in the provider’s catalogue. It is appended under "Other" and stays selected, so a refresh never silently rewrites the setting.',
			},
		},
	},
}

export const LongCatalogue: Story = {
	args: {
		...LiveCatalogue.args,
		value: 'openai/gpt-5-mini',
		models: openRouterModels,
		fallbackModels: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
		providerName: 'OpenRouter',
		status: { kind: 'live', count: openRouterModels.length, fetchedAt: Date.now() - 10_000 },
	},
	render: args => <Single {...args} />,
	parameters: {
		docs: {
			description: {
				story: 'OpenRouter lists hundreds of models, which is why the picker is a searchable combobox rather than a plain select.',
			},
		},
	},
}

export const CustomEndpoint: Story = {
	args: {
		...LiveCatalogue.args,
		value: 'llama3.1:8b',
		models: [],
		fallbackModels: [],
		providerName: 'this endpoint',
		status: { kind: 'idle' },
		catalogue: false,
	},
	render: args => <Single {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					'The Custom provider points at an endpoint we know nothing about, so the refresh button and status line drop away and the picker is just a type-anything field.',
			},
		},
	},
}

export const EnvLocked: Story = {
	args: {
		...LiveCatalogue.args,
		value: 'gpt-4o-mini',
		models: [],
		fallbackModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'],
		providerName: 'OpenAI',
		status: { kind: 'idle' },
		disabled: true,
	},
	render: args => <Single {...args} />,
	parameters: {
		docs: { description: { story: 'AI_MODEL is set in the environment, so the picker and its refresh button are both inert.' } },
	},
}
