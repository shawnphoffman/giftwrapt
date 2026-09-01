import { CheckIcon, Sparkles, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { testAiConnectionAsAdmin } from '@/api/admin-ai'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { type AiConfigResponse, useAiConfig, useAiConfigMutation } from '@/hooks/use-ai-config'
import { useAiModels } from '@/hooks/use-ai-models'
import { CUSTOM_PROVIDER_ID, findProviderMatch, type Provider, PROVIDERS } from '@/lib/ai-provider-catalog'
import { DEFAULT_MAX_OUTPUT_TOKENS, type ProviderType } from '@/lib/ai-types'
import { LIMITS } from '@/lib/validation/limits'

import { ModelPicker, type ModelPickerStatus } from './model-picker'

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
	const [model, setModel] = useState<string>(() => initialModel(config))
	const [awaitingLiveDefault, setAwaitingLiveDefault] = useState(false)
	const [apiKeyMode, setApiKeyMode] = useState<'display' | 'edit'>(config.apiKey.source === 'missing' ? 'edit' : 'display')
	const [apiKeyDraft, setApiKeyDraft] = useState<string>('')
	const [maxTokensDraft, setMaxTokensDraft] = useState<string>(() => String(config.maxOutputTokens.value))

	useEffect(() => {
		setProviderId(initialProviderId(config))
		setCustomBaseUrl(initialCustomBaseUrl(config))
		setModel(initialModel(config))
		setApiKeyMode(config.apiKey.source === 'missing' ? 'edit' : 'display')
		setApiKeyDraft('')
		setMaxTokensDraft(String(config.maxOutputTokens.value))
	}, [config])

	const provider = PROVIDERS.find(p => p.id === providerId)
	const isCustomProvider = providerId === CUSTOM_PROVIDER_ID
	const effectiveProviderType: ProviderType = isCustomProvider ? 'openai-compatible' : (provider?.providerType ?? 'openai')
	const showsBaseUrl = effectiveProviderType === 'openai-compatible'
	const effectiveBaseUrl = isCustomProvider ? customBaseUrl.trim() : (provider?.baseUrl ?? '')

	const fallbackModels = useMemo<ReadonlyArray<string>>(() => provider?.models ?? [], [provider])
	const effectiveModel = model.trim()

	const maxTokensParsed = Number.parseInt(maxTokensDraft, 10)
	const maxTokensValid = Number.isInteger(maxTokensParsed) && maxTokensParsed >= 1 && maxTokensParsed <= 64_000
	const effectiveMaxTokens = maxTokensValid ? maxTokensParsed : config.maxOutputTokens.value

	// Compute whether each field differs from saved.
	const providerTypeDirty = effectiveProviderType !== (config.providerType.value ?? '')
	const baseUrlDirty = showsBaseUrl ? effectiveBaseUrl !== (config.baseUrl.value ?? '') : config.baseUrl.value !== undefined // hop to non-baseUrl provider clears baseUrl
	const modelDirty = effectiveModel !== (config.model.value ?? '')
	const apiKeyDirty = apiKeyMode === 'edit' && apiKeyDraft.length > 0
	const maxTokensDirty = maxTokensValid && effectiveMaxTokens !== config.maxOutputTokens.value
	const dirty = providerTypeDirty || baseUrlDirty || modelDirty || apiKeyDirty || maxTokensDirty

	// Inputs are env-locked individually.
	const providerTypeLocked = config.envLocked.providerType
	const baseUrlLocked = config.envLocked.baseUrl
	const apiKeyLocked = config.envLocked.apiKey
	const modelLocked = config.envLocked.model
	const maxTokensLocked = config.envLocked.maxOutputTokens

	const baseUrlReady = showsBaseUrl ? effectiveBaseUrl.length > 0 : true
	const apiKeyAvailable = apiKeyDraft.length > 0 || config.apiKey.source !== 'missing'
	const canTest = baseUrlReady && effectiveModel.length > 0 && apiKeyAvailable && maxTokensValid

	// Live model catalogue for whatever provider the form currently points at.
	// Auto-fetches only against saved credentials; the refresh button can carry
	// an unsaved key so a new provider can be explored before anything is saved.
	const {
		result: modelsResult,
		isLoading: modelsLoading,
		refresh: refreshModels,
	} = useAiModels({
		providerType: effectiveProviderType,
		baseUrl: showsBaseUrl ? effectiveBaseUrl : '',
		enabled: !isCustomProvider && baseUrlReady && config.apiKey.source !== 'missing',
	})

	const liveModels = modelsResult?.ok ? modelsResult.models : []
	const providerName = isCustomProvider ? 'this endpoint' : (provider?.name ?? 'this endpoint')
	const modelsStatus: ModelPickerStatus = modelsLoading
		? { kind: 'loading' }
		: modelsResult?.ok
			? { kind: 'live', count: modelsResult.models.length, fetchedAt: modelsResult.fetchedAt }
			: modelsResult
				? { kind: 'error', error: modelsResult.error }
				: { kind: 'idle' }

	// After a provider switch the curated first model is only a placeholder:
	// once that provider's live catalogue lands, take its newest model instead.
	useEffect(() => {
		if (!awaitingLiveDefault) return
		if (modelsLoading) return
		if (liveModels.length > 0) setModel(liveModels[0].id)
		setAwaitingLiveDefault(false)
	}, [awaitingLiveDefault, modelsLoading, liveModels])

	const handleRefreshModels = () => {
		void refreshModels({
			apiKey: apiKeyDraft.length > 0 ? apiKeyDraft : undefined,
			baseUrl: showsBaseUrl ? effectiveBaseUrl : undefined,
		})
	}

	const handleProviderChange = (id: string) => {
		setProviderId(id)
		// Model ids don't carry across providers, so start from the new
		// provider's first known model (or empty, for endpoints we can't guess).
		const next = id === CUSTOM_PROVIDER_ID ? undefined : PROVIDERS.find(p => p.id === id)
		setModel(next?.models[0] ?? '')
		setAwaitingLiveDefault(id !== CUSTOM_PROVIDER_ID)
	}

	const handleModelChange = (next: string) => {
		setModel(next)
		// An explicit pick outranks the pending live default.
		setAwaitingLiveDefault(false)
	}

	const handleSave = async () => {
		const patch: {
			providerType?: ProviderType
			baseUrl?: string | null
			apiKey?: string
			model?: string
			maxOutputTokens?: number
		} = {}
		if (providerTypeDirty && !providerTypeLocked) patch.providerType = effectiveProviderType
		if (baseUrlDirty && !baseUrlLocked) {
			// Clear the saved base URL when switching to a provider that doesn't use one.
			patch.baseUrl = showsBaseUrl ? effectiveBaseUrl : null
		}
		if (modelDirty && !modelLocked) patch.model = effectiveModel
		if (apiKeyDirty && !apiKeyLocked) patch.apiKey = apiKeyDraft
		if (maxTokensDirty && !maxTokensLocked) patch.maxOutputTokens = effectiveMaxTokens

		if (Object.keys(patch).length === 0) return

		const res = await mutate(patch)
		if ('ok' in res && res.ok === false) {
			toast.error(res.error)
			return
		}
		toast.success('AI settings updated')
	}

	const handleClearAll = async () => {
		const patch: {
			providerType?: null
			baseUrl?: null
			apiKey?: null
			model?: null
			maxOutputTokens?: null
		} = {}
		if (config.providerType.source === 'db') patch.providerType = null
		if (config.baseUrl.source === 'db') patch.baseUrl = null
		if (config.apiKey.source === 'db') patch.apiKey = null
		if (config.model.source === 'db') patch.model = null
		if (config.maxOutputTokens.source === 'db') patch.maxOutputTokens = null

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

	const hasAnyDbValue =
		config.providerType.source === 'db' ||
		config.baseUrl.source === 'db' ||
		config.apiKey.source === 'db' ||
		config.model.source === 'db' ||
		config.maxOutputTokens.source === 'db'

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">AI</CardTitle>
					<CardDescription>
						Configure the AI provider used for scraping post-passes and Intelligence recommendations. Any OpenAI-compatible endpoint works.
						Values provided via environment variables take precedence and cannot be edited here.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					{/* Provider */}
					<div className="flex flex-col gap-2">
						<div className="space-y-0.5">
							<Label htmlFor="aiProvider" className="text-base">
								Provider
							</Label>
							<p className="text-sm text-muted-foreground">
								Pick OpenAI, Anthropic, a known OpenAI-compatible provider, or Custom to point at any other endpoint.
							</p>
						</div>
						<Select value={providerId} onValueChange={handleProviderChange} disabled={providerTypeLocked || baseUrlLocked || saving}>
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
						{!isCustomProvider && provider?.baseUrl && <p className="text-xs text-muted-foreground font-mono">{provider.baseUrl}</p>}
						{providerTypeLocked && <p className="text-xs text-muted-foreground">Set by AI_PROVIDER_TYPE. Unset to edit here.</p>}
						{baseUrlLocked && <p className="text-xs text-muted-foreground">Set by AI_BASE_URL. Unset to edit here.</p>}
					</div>

					{/* Custom base URL (only when provider type is openai-compatible AND custom) */}
					{showsBaseUrl && isCustomProvider && (
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
								maxLength={LIMITS.URL}
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
								<Button type="button" variant="outline" onClick={handleApiKeyReplace} disabled={saving}>
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
									maxLength={LIMITS.SECRET}
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
								Pick a model this provider currently offers, or type any identifier it accepts.
							</p>
						</div>
						<ModelPicker
							// Remounting on a provider switch closes the popover and clears
							// its search, so a stale catalogue is never left on screen.
							key={providerId}
							id="aiModel"
							value={model}
							onChange={handleModelChange}
							models={liveModels}
							fallbackModels={fallbackModels}
							providerName={providerName}
							status={modelsStatus}
							onRefresh={handleRefreshModels}
							catalogue={!isCustomProvider}
							disabled={modelLocked || saving}
						/>
						{modelLocked && <p className="text-xs text-muted-foreground">Set by AI_MODEL. Unset to edit here.</p>}
					</div>

					<Separator />

					<TestConnectionSection
						canTest={canTest}
						dirty={dirty}
						draftProviderType={providerTypeDirty ? effectiveProviderType : undefined}
						draftApiKey={apiKeyDirty ? apiKeyDraft : undefined}
						draftBaseUrl={baseUrlDirty && showsBaseUrl ? effectiveBaseUrl : undefined}
						draftModel={modelDirty ? effectiveModel : undefined}
						draftMaxOutputTokens={maxTokensDirty ? effectiveMaxTokens : undefined}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">AI Provider Settings</CardTitle>
					<CardDescription>
						Tunables that apply across every AI feature. Provider-specific options will live here as we add them.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					{/* Max output tokens */}
					<div className="flex flex-col gap-2">
						<div className="space-y-0.5">
							<Label htmlFor="aiMaxOutputTokens" className="text-base">
								Max Output Tokens
							</Label>
							<p className="text-sm text-muted-foreground">
								Caps the response length for connection tests and any AI features. Reasoning models need at least a few hundred.
							</p>
						</div>
						<Input
							id="aiMaxOutputTokens"
							type="number"
							inputMode="numeric"
							min={1}
							max={64_000}
							value={maxTokensDraft}
							placeholder={String(DEFAULT_MAX_OUTPUT_TOKENS)}
							disabled={maxTokensLocked || saving}
							onChange={e => setMaxTokensDraft(e.target.value)}
							className="w-40"
						/>
						{!maxTokensValid && maxTokensDraft.length > 0 && (
							<p className="text-xs text-destructive">Enter a whole number between 1 and 64000.</p>
						)}
						{maxTokensLocked && <p className="text-xs text-muted-foreground">Set by AI_MAX_OUTPUT_TOKENS. Unset to edit here.</p>}
					</div>
				</CardContent>
			</Card>

			{/* Save button row covers both Provider and Provider settings cards */}
			<div className="flex items-center gap-2 justify-end">
				<Button type="button" onClick={handleSave} disabled={!dirty || saving}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
				{hasAnyDbValue && (
					<Button type="button" variant="outline" onClick={handleClearAll} disabled={saving}>
						Clear All
					</Button>
				)}
			</div>
		</div>
	)
}

type TestConnectionSectionProps = {
	canTest: boolean
	dirty: boolean
	draftProviderType?: ProviderType
	draftApiKey?: string
	draftBaseUrl?: string
	draftModel?: string
	draftMaxOutputTokens?: number
}

function TestConnectionSection({
	canTest,
	dirty,
	draftProviderType,
	draftApiKey,
	draftBaseUrl,
	draftModel,
	draftMaxOutputTokens,
}: TestConnectionSectionProps) {
	const [testing, setTesting] = useState(false)
	const [result, setResult] = useState<{ ok: true; latencyMs: number } | { ok: false; error: string } | null>(null)

	const handleClick = async () => {
		setTesting(true)
		setResult(null)
		try {
			const body: {
				providerType?: ProviderType
				apiKey?: string
				baseUrl?: string
				model?: string
				maxOutputTokens?: number
			} = {}
			if (draftProviderType !== undefined) body.providerType = draftProviderType
			if (draftApiKey !== undefined) body.apiKey = draftApiKey
			if (draftBaseUrl !== undefined) body.baseUrl = draftBaseUrl
			if (draftModel !== undefined) body.model = draftModel
			if (draftMaxOutputTokens !== undefined) body.maxOutputTokens = draftMaxOutputTokens
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
				<h3 className="text-lg font-medium">Test Connection</h3>
				<p className="text-sm text-muted-foreground">
					Sends a small chat request through the Vercel AI SDK to verify the provider, API key, and model in one round-trip.
					{dirty ? ' Uses the values currently in the form (including unsaved drafts).' : ''}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Button type="button" variant="outline" className="gap-2" onClick={handleClick} disabled={!canTest || testing}>
					{Icon}
					{testing ? 'Testing…' : 'Test Connection'}
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

function defaultProviderForType(providerType: ProviderType | undefined): Provider | undefined {
	if (!providerType) return undefined
	return PROVIDERS.find(p => p.providerType === providerType)
}

function initialProviderId(config: AiConfigResponse): string {
	const match = findProviderMatch(config.providerType.value, config.baseUrl.value)
	if (match) return match.id
	// openai-compatible with an unknown baseUrl, or no provider type set yet but a baseUrl is present.
	if (config.providerType.value === 'openai-compatible') return CUSTOM_PROVIDER_ID
	if (!config.providerType.value && config.baseUrl.value) return CUSTOM_PROVIDER_ID
	// Fall back to a sane default when nothing is configured yet.
	return defaultProviderForType(config.providerType.value)?.id ?? PROVIDERS[0].id
}

function initialCustomBaseUrl(config: AiConfigResponse): string {
	if (initialProviderId(config) !== CUSTOM_PROVIDER_ID) return ''
	return config.baseUrl.value ?? ''
}

// The saved model wins outright, whatever the curated list says about it.
function initialModel(config: AiConfigResponse): string {
	if (config.model.value) return config.model.value
	const match = findProviderMatch(config.providerType.value, config.baseUrl.value) ?? PROVIDERS[0]
	return match.models[0] ?? ''
}
