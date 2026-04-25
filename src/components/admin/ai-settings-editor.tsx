import { CheckIcon, Sparkles, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { testAiConnectionAsAdmin } from '@/api/admin-ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { type AiConfigResponse, useAiConfig, useAiConfigMutation } from '@/hooks/use-ai-config'

// Known OpenAI-compatible providers. Adding a new one here surfaces it in
// both the provider dropdown and (via models) the model dropdown.
type Provider = {
	id: string
	name: string
	baseUrl: string
	models: ReadonlyArray<string>
}

const CUSTOM_PROVIDER_ID = 'custom'
const CUSTOM_MODEL_VALUE = '__custom__'

const PROVIDERS: ReadonlyArray<Provider> = [
	{
		id: 'openai',
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
	},
	{
		id: 'openrouter',
		name: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		models: [
			'openai/gpt-4o-mini',
			'anthropic/claude-3.5-sonnet',
			'meta-llama/llama-3.3-70b-instruct',
			'google/gemini-2.0-flash-exp:free',
			'deepseek/deepseek-chat',
		],
	},
	{
		id: 'groq',
		name: 'Groq',
		baseUrl: 'https://api.groq.com/openai/v1',
		models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
	},
	{
		id: 'together',
		name: 'Together AI',
		baseUrl: 'https://api.together.xyz/v1',
		models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
	},
	{
		id: 'mistral',
		name: 'Mistral',
		baseUrl: 'https://api.mistral.ai/v1',
		models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
	},
	{
		id: 'deepseek',
		name: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1',
		models: ['deepseek-chat', 'deepseek-reasoner'],
	},
	{
		id: 'ollama',
		name: 'Ollama (localhost)',
		baseUrl: 'http://localhost:11434/v1',
		models: [],
	},
	{
		id: 'lmstudio',
		name: 'LM Studio (localhost)',
		baseUrl: 'http://localhost:1234/v1',
		models: [],
	},
]

function findProviderByBaseUrl(url: string | undefined | null): Provider | undefined {
	if (!url) return undefined
	return PROVIDERS.find(p => p.baseUrl === url)
}

export function AiSettingsEditor() {
	const { data, isLoading } = useAiConfig()
	const mutation = useAiConfigMutation()

	if (isLoading || !data) {
		return <div className="text-sm text-muted-foreground">Loading AI settings…</div>
	}

	return <Form config={data} saving={mutation.isPending} mutate={mutation.mutateAsync} />
}

type FormProps = {
	config: AiConfigResponse
	saving: boolean
	mutate: ReturnType<typeof useAiConfigMutation>['mutateAsync']
}

function Form({ config, saving, mutate }: FormProps) {
	// Hydrate from saved config. Re-hydrate when the saved values change (so a
	// successful save resets the dirty state without losing user focus on
	// fields they didn't touch).
	const [providerId, setProviderId] = useState<string>(() => initialProviderId(config))
	const [customBaseUrl, setCustomBaseUrl] = useState<string>(() => initialCustomBaseUrl(config))
	const [modelSelect, setModelSelect] = useState<string>(() => initialModelSelect(config))
	const [customModel, setCustomModel] = useState<string>(() => initialCustomModel(config))
	const [apiKeyMode, setApiKeyMode] = useState<'display' | 'edit'>(config.apiKey.source === 'missing' ? 'edit' : 'display')
	const [apiKeyDraft, setApiKeyDraft] = useState<string>('')

	// Reset draft on successful save (when underlying config changes).
	useEffect(() => {
		setProviderId(initialProviderId(config))
		setCustomBaseUrl(initialCustomBaseUrl(config))
		setModelSelect(initialModelSelect(config))
		setCustomModel(initialCustomModel(config))
		setApiKeyMode(config.apiKey.source === 'missing' ? 'edit' : 'display')
		setApiKeyDraft('')
	}, [config])

	const provider = PROVIDERS.find(p => p.id === providerId)
	const isCustomProvider = providerId === CUSTOM_PROVIDER_ID
	const effectiveBaseUrl = isCustomProvider ? customBaseUrl.trim() : (provider?.baseUrl ?? '')

	const modelOptions = useMemo<ReadonlyArray<string>>(() => provider?.models ?? [], [provider])
	const isCustomModel = modelSelect === CUSTOM_MODEL_VALUE || modelOptions.length === 0
	const effectiveModel = isCustomModel ? customModel.trim() : modelSelect

	// Compute whether each field differs from saved.
	const baseUrlDirty = effectiveBaseUrl !== (config.baseUrl.value ?? '')
	const modelDirty = effectiveModel !== (config.model.value ?? '')
	const apiKeyDirty = apiKeyMode === 'edit' && apiKeyDraft.length > 0
	const dirty = baseUrlDirty || modelDirty || apiKeyDirty

	// Inputs are env-locked individually.
	const baseUrlLocked = config.envLocked.baseUrl
	const apiKeyLocked = config.envLocked.apiKey
	const modelLocked = config.envLocked.model

	// We can test as long as all three values resolve to something non-empty,
	// either through saved values or current drafts. The api key test value
	// uses the draft when in edit mode; otherwise the server falls back to
	// the saved (or env) value.
	const apiKeyAvailable = apiKeyDraft.length > 0 || config.apiKey.source !== 'missing'
	const canTest = effectiveBaseUrl.length > 0 && effectiveModel.length > 0 && apiKeyAvailable

	const handleProviderChange = (id: string) => {
		setProviderId(id)
		// Reset model to a sensible default for the new provider.
		const next = PROVIDERS.find(p => p.id === id)
		const nextModels = next?.models ?? []
		if (nextModels.length > 0) {
			setModelSelect(nextModels[0])
			setCustomModel('')
		} else {
			setModelSelect(CUSTOM_MODEL_VALUE)
		}
	}

	const handleSave = async () => {
		const patch: { baseUrl?: string; apiKey?: string; model?: string } = {}
		if (baseUrlDirty && !baseUrlLocked) patch.baseUrl = effectiveBaseUrl
		if (modelDirty && !modelLocked) patch.model = effectiveModel
		if (apiKeyDirty && !apiKeyLocked) patch.apiKey = apiKeyDraft

		if (Object.keys(patch).length === 0) return

		const res = await mutate(patch)
		if ('ok' in res && res.ok === false) {
			toast.error(res.error)
			return
		}
		toast.success('AI settings updated')
	}

	const handleClearAll = async () => {
		const patch: { baseUrl?: null; apiKey?: null; model?: null } = {}
		if (config.baseUrl.source === 'db') patch.baseUrl = null
		if (config.apiKey.source === 'db') patch.apiKey = null
		if (config.model.source === 'db') patch.model = null

		if (Object.keys(patch).length === 0) return

		const res = await mutate(patch)
		if ('ok' in res && res.ok === false) {
			toast.error(res.error)
			return
		}
		toast.success('AI settings cleared')
	}

	const handleApiKeyReplace = () => {
		setApiKeyDraft('')
		setApiKeyMode('edit')
	}

	const handleApiKeyCancel = () => {
		setApiKeyDraft('')
		if (config.apiKey.source !== 'missing') setApiKeyMode('display')
	}

	const hasAnyDbValue = config.baseUrl.source === 'db' || config.apiKey.source === 'db' || config.model.source === 'db'

	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-6">
				{/* Provider */}
				<div className="flex flex-col gap-2">
					<div className="space-y-0.5">
						<Label htmlFor="aiProvider" className="text-base">
							Provider
						</Label>
						<p className="text-sm text-muted-foreground">
							Pick a known OpenAI-compatible provider, or choose Custom to point at any other endpoint.
						</p>
					</div>
					<Select value={providerId} onValueChange={handleProviderChange} disabled={baseUrlLocked || saving}>
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
					{!isCustomProvider && provider && <p className="text-xs text-muted-foreground font-mono">{provider.baseUrl}</p>}
					{baseUrlLocked && <p className="text-xs text-muted-foreground">Set by AI_BASE_URL. Unset to edit here.</p>}
				</div>

				{/* Custom base URL (only when provider is custom) */}
				{isCustomProvider && (
					<div className="flex flex-col gap-2">
						<div className="space-y-0.5">
							<Label htmlFor="aiBaseUrl" className="text-base">
								Base URL
							</Label>
							<p className="text-sm text-muted-foreground">
								The chat-completions API root, without a trailing slash. Example: http://localhost:11434/v1
							</p>
						</div>
						<Input
							id="aiBaseUrl"
							type="url"
							value={customBaseUrl}
							placeholder="https://example.com/v1"
							disabled={baseUrlLocked || saving}
							onChange={e => setCustomBaseUrl(e.target.value)}
						/>
					</div>
				)}

				{/* API key */}
				<div className="flex flex-col gap-2">
					<div className="space-y-0.5">
						<Label htmlFor="aiApiKey" className="text-base">
							API Key
						</Label>
						<p className="text-sm text-muted-foreground">Bearer token sent to the provider. Encrypted at rest.</p>
					</div>
					{apiKeyLocked ? (
						<>
							<Input id="aiApiKey" value={config.apiKey.preview ?? ''} disabled readOnly className="font-mono" />
							<p className="text-xs text-muted-foreground">Set by AI_API_KEY. Unset to edit here.</p>
						</>
					) : apiKeyMode === 'display' && config.apiKey.source === 'db' ? (
						<div className="flex items-center gap-2">
							<Input id="aiApiKey" value={config.apiKey.preview ?? ''} disabled readOnly className="font-mono" />
							<Button type="button" variant="secondary" onClick={handleApiKeyReplace} disabled={saving}>
								Replace
							</Button>
						</div>
					) : (
						<div className="flex items-center gap-2">
							<Input
								id="aiApiKey"
								type="password"
								autoComplete="off"
								value={apiKeyDraft}
								placeholder="sk-…"
								disabled={saving}
								onChange={e => setApiKeyDraft(e.target.value)}
							/>
							{config.apiKey.source !== 'missing' && (
								<Button type="button" variant="outline" onClick={handleApiKeyCancel} disabled={saving}>
									Cancel
								</Button>
							)}
						</div>
					)}
				</div>

				{/* Model */}
				<div className="flex flex-col gap-2">
					<div className="space-y-0.5">
						<Label htmlFor="aiModel" className="text-base">
							Model
						</Label>
						<p className="text-sm text-muted-foreground">
							{modelOptions.length > 0
								? 'Pick from common models for this provider, or choose Custom.'
								: 'Enter a model identifier supported by this provider.'}
						</p>
					</div>
					{modelOptions.length > 0 && (
						<Select value={modelSelect} onValueChange={setModelSelect} disabled={modelLocked || saving}>
							<SelectTrigger id="aiModel" className="w-full">
								<SelectValue placeholder="Select a model" />
							</SelectTrigger>
							<SelectContent>
								{modelOptions.map(m => (
									<SelectItem key={m} value={m}>
										{m}
									</SelectItem>
								))}
								<SelectItem value={CUSTOM_MODEL_VALUE}>Custom…</SelectItem>
							</SelectContent>
						</Select>
					)}
					{isCustomModel && (
						<Input
							id={modelOptions.length > 0 ? 'aiModelCustom' : 'aiModel'}
							type="text"
							value={customModel}
							placeholder={modelOptions.length === 0 ? 'e.g. llama3.1:8b' : 'Enter custom model name'}
							disabled={modelLocked || saving}
							onChange={e => setCustomModel(e.target.value)}
						/>
					)}
					{modelLocked && <p className="text-xs text-muted-foreground">Set by AI_MODEL. Unset to edit here.</p>}
				</div>

				{/* Save button row */}
				<div className="flex items-center gap-2">
					<Button type="button" onClick={handleSave} disabled={!dirty || saving}>
						{saving ? 'Saving…' : 'Save'}
					</Button>
					{hasAnyDbValue && (
						<Button type="button" variant="outline" onClick={handleClearAll} disabled={saving}>
							Clear all
						</Button>
					)}
				</div>
			</section>

			<Separator />

			<TestConnectionSection
				canTest={canTest}
				dirty={dirty}
				draftApiKey={apiKeyDirty ? apiKeyDraft : undefined}
				draftBaseUrl={baseUrlDirty ? effectiveBaseUrl : undefined}
				draftModel={modelDirty ? effectiveModel : undefined}
			/>
		</div>
	)
}

type TestConnectionSectionProps = {
	canTest: boolean
	dirty: boolean
	draftApiKey?: string
	draftBaseUrl?: string
	draftModel?: string
}

function TestConnectionSection({ canTest, dirty, draftApiKey, draftBaseUrl, draftModel }: TestConnectionSectionProps) {
	const [testing, setTesting] = useState(false)
	const [result, setResult] = useState<{ ok: true; latencyMs: number } | { ok: false; error: string } | null>(null)

	const handleClick = async () => {
		setTesting(true)
		setResult(null)
		try {
			const body: { apiKey?: string; baseUrl?: string; model?: string } = {}
			if (draftApiKey !== undefined) body.apiKey = draftApiKey
			if (draftBaseUrl !== undefined) body.baseUrl = draftBaseUrl
			if (draftModel !== undefined) body.model = draftModel
			const res = await testAiConnectionAsAdmin({ data: body } as Parameters<typeof testAiConnectionAsAdmin>[0])
			setResult(res)
			if (res.ok) toast.success(`Connection OK (${res.latencyMs} ms)`)
			else toast.error(res.error)
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Test failed'
			setResult({ ok: false, error: msg })
			toast.error(msg)
		} finally {
			setTesting(false)
		}
	}

	const Icon = !result || testing ? <Sparkles /> : result.ok ? <CheckIcon /> : <XIcon />

	return (
		<section className="flex flex-col gap-3">
			<div className="space-y-0.5">
				<h3 className="text-lg font-medium">Test connection</h3>
				<p className="text-sm text-muted-foreground">
					Sends a one-token chat-completions request to verify the base URL, API key, and model name in one round-trip.
					{dirty ? ' Uses the values currently in the form (including unsaved drafts).' : ''}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Button type="button" variant="secondary" className="gap-2" onClick={handleClick} disabled={!canTest || testing}>
					{Icon}
					{testing ? 'Testing…' : 'Test connection'}
				</Button>
				{result?.ok === true && <span className="text-sm text-muted-foreground">OK ({result.latencyMs} ms)</span>}
				{result?.ok === false && <span className="text-sm text-destructive">{result.error}</span>}
			</div>
		</section>
	)
}

// ===============================
// Hydration helpers
// ===============================

function initialProviderId(config: AiConfigResponse): string {
	const match = findProviderByBaseUrl(config.baseUrl.value)
	if (match) return match.id
	if (config.baseUrl.value) return CUSTOM_PROVIDER_ID
	return PROVIDERS[0].id
}

function initialCustomBaseUrl(config: AiConfigResponse): string {
	const match = findProviderByBaseUrl(config.baseUrl.value)
	if (match) return ''
	return config.baseUrl.value ?? ''
}

function initialModelSelect(config: AiConfigResponse): string {
	const provider = findProviderByBaseUrl(config.baseUrl.value) ?? PROVIDERS[0]
	const models = provider.models
	if (config.model.value && models.includes(config.model.value)) return config.model.value
	if (config.model.value && !models.includes(config.model.value)) return CUSTOM_MODEL_VALUE
	if (models.length === 0) return CUSTOM_MODEL_VALUE
	return models[0]
}

function initialCustomModel(config: AiConfigResponse): string {
	const provider = findProviderByBaseUrl(config.baseUrl.value) ?? PROVIDERS[0]
	if (config.model.value && !provider.models.includes(config.model.value)) return config.model.value
	return ''
}
