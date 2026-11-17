import { CheckIcon, Sparkles, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { AiConfigResponse, AiSlotResponse, TestAiConnectionResult, UpdateAiSlotInput } from '@/api/admin-ai'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { ModelRate } from '@/lib/ai-cost'
import { CUSTOM_PROVIDER_ID, findProviderMatch, PROVIDERS } from '@/lib/ai-provider-catalog'
import type { AiExtraSlot } from '@/lib/ai-slots'
import type { ProviderModel, ProviderType } from '@/lib/ai-types'
import { LIMITS } from '@/lib/validation/limits'

import { ModelPicker, type ModelPickerStatus } from './model-picker'

const ENV_PREFIX: Record<AiExtraSlot, string> = { fast: 'AI_FAST', vision: 'AI_VISION' }

export type AiSlotTestBody = {
	slot: AiExtraSlot
	ownProvider: boolean
	providerType?: ProviderType
	baseUrl?: string
	apiKey?: string
	model?: string
}

// What the card needs to know about the provider the form currently points
// at, so the container can fetch that provider's model list.
export type AiSlotCatalogueTarget = { ownProvider: boolean; providerType: ProviderType; baseUrl: string; custom: boolean }

export type AiSlotCardProps = {
	slot: AiExtraSlot
	title: string
	description: string
	// Labels of the features that run on this slot.
	features: ReadonlyArray<string>
	config: AiSlotResponse
	// The main config, for "Same as default (...)" and the model list of a
	// slot that borrows the main provider.
	main: AiConfigResponse
	saving: boolean
	onSave: (input: UpdateAiSlotInput) => void
	onTest: (body: AiSlotTestBody) => Promise<TestAiConnectionResult>
	models: ReadonlyArray<ProviderModel>
	modelsStatus: ModelPickerStatus
	onRefreshModels: (draft: { apiKey?: string; baseUrl?: string }) => void
	onCatalogueTargetChange?: (target: AiSlotCatalogueTarget) => void
	// Price entry for a model the built-in cost table does not know.
	// Omitted, the fields are not shown.
	rate?: {
		// True when the built-in price list covers the model.
		isKnown: (model: string) => boolean
		valueFor: (model: string) => ModelRate | undefined
		pending: boolean
		onSave: (model: string, rate: ModelRate | null) => void
	}
}

function initialProviderId(config: AiSlotResponse, main: AiConfigResponse): string {
	const type = config.providerType.value
	if (!type) {
		// Not on its own provider yet: start the picker on something other
		// than the main provider, since that is the reason to flip the switch.
		const mainMatch = findProviderMatch(main.providerType.value, main.baseUrl.value)
		return (PROVIDERS.find(p => p.id !== mainMatch?.id) ?? PROVIDERS[0]).id
	}
	return findProviderMatch(type, config.baseUrl.value)?.id ?? (type === 'openai-compatible' ? CUSTOM_PROVIDER_ID : PROVIDERS[0].id)
}

function modeBadge(config: AiSlotResponse): { label: string; variant: 'secondary' | 'outline' | 'destructive' } {
	switch (config.mode) {
		case 'model':
			return { label: 'Own Model', variant: 'secondary' }
		case 'provider':
			return { label: 'Own Provider', variant: 'secondary' }
		case 'misconfigured':
			return { label: 'Incomplete', variant: 'destructive' }
		default:
			return { label: 'Same as Default', variant: 'outline' }
	}
}

export function AiSlotCard({
	slot,
	title,
	description,
	features,
	config,
	main,
	saving,
	onSave,
	onTest,
	models,
	modelsStatus,
	onRefreshModels,
	onCatalogueTargetChange,
	rate,
}: AiSlotCardProps) {
	const savedOwnProvider = config.providerType.value !== undefined
	const [ownProvider, setOwnProvider] = useState(savedOwnProvider)
	const [providerId, setProviderId] = useState(() => initialProviderId(config, main))
	const [customBaseUrl, setCustomBaseUrl] = useState(() =>
		initialProviderId(config, main) === CUSTOM_PROVIDER_ID ? (config.baseUrl.value ?? '') : ''
	)
	const [model, setModel] = useState(config.model.value ?? '')
	const [apiKeyMode, setApiKeyMode] = useState<'display' | 'edit'>(config.apiKey.source === 'missing' ? 'edit' : 'display')
	const [apiKeyDraft, setApiKeyDraft] = useState('')

	// Re-hydrate after a save or clear lands.
	useEffect(() => {
		const id = initialProviderId(config, main)
		setOwnProvider(config.providerType.value !== undefined)
		setProviderId(id)
		setCustomBaseUrl(id === CUSTOM_PROVIDER_ID ? (config.baseUrl.value ?? '') : '')
		setModel(config.model.value ?? '')
		setApiKeyMode(config.apiKey.source === 'missing' ? 'edit' : 'display')
		setApiKeyDraft('')
		// `main` only seeds the provider picker; a change there must not wipe a draft.
	}, [config])

	const provider = PROVIDERS.find(p => p.id === providerId)
	const isCustom = providerId === CUSTOM_PROVIDER_ID
	const slotProviderType: ProviderType = isCustom ? 'openai-compatible' : (provider?.providerType ?? 'openai')
	const slotBaseUrl = isCustom ? customBaseUrl.trim() : (provider?.baseUrl ?? '')
	const showsBaseUrl = slotProviderType === 'openai-compatible'

	const mainProvider = findProviderMatch(main.providerType.value, main.baseUrl.value)
	const mainProviderName = mainProvider?.name ?? 'the default provider'
	const providerName = ownProvider ? (isCustom ? 'this endpoint' : (provider?.name ?? 'this endpoint')) : mainProviderName
	const fallbackModels = useMemo<ReadonlyArray<string>>(
		() => (ownProvider ? (provider?.models ?? []) : (mainProvider?.models ?? [])),
		[ownProvider, provider, mainProvider]
	)

	// Tell the container which provider's models to list.
	const targetProviderType = ownProvider ? slotProviderType : main.providerType.value
	const targetBaseUrl = ownProvider ? slotBaseUrl : (main.baseUrl.value ?? '')
	useEffect(() => {
		if (!targetProviderType) return
		onCatalogueTargetChange?.({ ownProvider, providerType: targetProviderType, baseUrl: targetBaseUrl, custom: ownProvider && isCustom })
	}, [ownProvider, targetProviderType, targetBaseUrl, isCustom])

	const trimmedModel = model.trim()
	const locks = config.envLocked
	const anyLocked = locks.providerType || locks.baseUrl || locks.apiKey || locks.model
	// A provider type set in the environment decides the mode for us.
	const modeLocked = locks.providerType

	const savedProviderType = config.providerType.value
	const providerChanged = ownProvider && savedOwnProvider && slotProviderType !== savedProviderType
	const keyCarriesOver = savedOwnProvider && !providerChanged && config.apiKey.source !== 'missing'
	const apiKeyAvailable = apiKeyDraft.length > 0 || keyCarriesOver

	const dirty =
		ownProvider !== savedOwnProvider ||
		trimmedModel !== (config.model.value ?? '') ||
		(ownProvider &&
			(slotProviderType !== savedProviderType || (showsBaseUrl && slotBaseUrl !== (config.baseUrl.value ?? '')) || apiKeyDraft.length > 0))

	// Own provider needs everything; model only needs nothing (an empty
	// model there means "follow the default", which is a valid save).
	const complete = ownProvider ? trimmedModel.length > 0 && apiKeyAvailable && (!showsBaseUrl || slotBaseUrl.length > 0) : true
	const missing = ownProvider
		? !trimmedModel
			? 'Pick a model for this provider.'
			: !apiKeyAvailable
				? 'Enter the API key for this provider.'
				: showsBaseUrl && !slotBaseUrl
					? 'Enter the base URL.'
					: null
		: null

	const hasSavedValue =
		config.providerType.source === 'db' || config.baseUrl.source === 'db' || config.apiKey.source === 'db' || config.model.source === 'db'

	const handleSave = () => {
		onSave({
			slot,
			model: trimmedModel || null,
			provider: ownProvider
				? { providerType: slotProviderType, baseUrl: showsBaseUrl ? slotBaseUrl : null, ...(apiKeyDraft ? { apiKey: apiKeyDraft } : {}) }
				: null,
		})
	}

	const handleOwnProviderChange = (checked: boolean) => {
		setOwnProvider(checked)
		// Model ids do not carry between providers.
		setModel(checked === savedOwnProvider ? (config.model.value ?? '') : '')
		setApiKeyDraft('')
	}

	const handleProviderChange = (id: string) => {
		setProviderId(id)
		setModel('')
		setApiKeyDraft('')
		const next = PROVIDERS.find(p => p.id === id)
		const sameAsSaved = savedOwnProvider && id !== CUSTOM_PROVIDER_ID && next?.providerType === savedProviderType
		setApiKeyMode(sameAsSaved && config.apiKey.source !== 'missing' ? 'display' : 'edit')
	}

	const badge = modeBadge(config)
	const defaultModel = main.model.value
	const canTest = (ownProvider ? complete : Boolean(main.isValid)) && (trimmedModel.length > 0 || Boolean(defaultModel))
	const prefix = ENV_PREFIX[slot]
	const showKeyDisplay = apiKeyMode === 'display' && keyCarriesOver

	return (
		<Card data-slot-card={slot}>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<CardTitle className="text-2xl">{title}</CardTitle>
					<Badge variant={badge.variant}>{badge.label}</Badge>
				</div>
				<CardDescription>
					{description} Used by: {features.join(', ')}.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				{config.mode === 'misconfigured' && (
					<p className="text-sm text-destructive">
						This slot names a provider but is missing its key, model or base URL, so these features are running on the default model.
					</p>
				)}

				{/* Own provider switch */}
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-0.5">
						<Label htmlFor={`${slot}-own-provider`} className="text-base">
							Use a Different Provider
						</Label>
						<p className="text-sm text-muted-foreground">
							Off, this slot runs on {mainProviderName} with the key above. On, it gets its own provider and key.
						</p>
						{modeLocked && <p className="text-xs text-muted-foreground">Set by {prefix}_PROVIDER_TYPE. Unset to change here.</p>}
					</div>
					<Switch
						id={`${slot}-own-provider`}
						checked={ownProvider}
						disabled={saving || modeLocked}
						onCheckedChange={handleOwnProviderChange}
					/>
				</div>

				{ownProvider && (
					<>
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${slot}-provider`} className="text-base">
								Provider
							</Label>
							<Select value={providerId} onValueChange={handleProviderChange} disabled={saving || locks.providerType || locks.baseUrl}>
								<SelectTrigger id={`${slot}-provider`} className="w-full">
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
							{!isCustom && provider?.baseUrl && <p className="text-xs text-muted-foreground font-mono break-all">{provider.baseUrl}</p>}
							{locks.baseUrl && <p className="text-xs text-muted-foreground">Set by {prefix}_BASE_URL. Unset to edit here.</p>}
						</div>

						{showsBaseUrl && isCustom && (
							<div className="flex flex-col gap-2">
								<Label htmlFor={`${slot}-base-url`} className="text-base">
									Base URL
								</Label>
								<Input
									id={`${slot}-base-url`}
									type="url"
									value={customBaseUrl}
									placeholder="https://example.com/v1"
									disabled={saving || locks.baseUrl}
									maxLength={LIMITS.URL}
									onChange={e => setCustomBaseUrl(e.target.value)}
								/>
							</div>
						)}

						<div className="flex flex-col gap-2">
							<div className="space-y-0.5">
								<Label htmlFor={`${slot}-api-key`} className="text-base">
									API Key
								</Label>
								<p className="text-sm text-muted-foreground">The key for this provider. Encrypted at rest. The key above is not used.</p>
							</div>
							{locks.apiKey ? (
								<>
									<Input id={`${slot}-api-key`} value={config.apiKey.preview ?? ''} disabled readOnly className="font-mono" />
									<p className="text-xs text-muted-foreground">Set by {prefix}_API_KEY. Unset to edit here.</p>
								</>
							) : showKeyDisplay ? (
								<div className="flex items-center gap-2">
									<Input id={`${slot}-api-key`} value={config.apiKey.preview ?? ''} disabled readOnly className="font-mono" />
									<Button type="button" variant="outline" disabled={saving} onClick={() => setApiKeyMode('edit')}>
										Replace
									</Button>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<Input
										id={`${slot}-api-key`}
										type="password"
										autoComplete="off"
										value={apiKeyDraft}
										placeholder="sk-…"
										disabled={saving}
										maxLength={LIMITS.SECRET}
										onChange={e => setApiKeyDraft(e.target.value)}
									/>
									{keyCarriesOver && (
										<Button
											type="button"
											variant="outline"
											disabled={saving}
											onClick={() => {
												setApiKeyDraft('')
												setApiKeyMode('display')
											}}
										>
											Cancel
										</Button>
									)}
								</div>
							)}
						</div>
					</>
				)}

				{/* Model */}
				<div className="flex flex-col gap-2">
					<div className="space-y-0.5">
						<Label htmlFor={`${slot}-model`} className="text-base">
							Model
						</Label>
						<p className="text-sm text-muted-foreground">
							{ownProvider
								? `A model ${providerName} offers.`
								: `A model ${mainProviderName} offers. Leave it empty to use the default model.`}
						</p>
					</div>
					<div className="flex items-start gap-2">
						<div className="min-w-0 flex-1">
							<ModelPicker
								key={`${ownProvider}-${providerId}`}
								id={`${slot}-model`}
								value={model}
								onChange={setModel}
								models={models}
								fallbackModels={fallbackModels}
								providerName={providerName}
								status={modelsStatus}
								onRefresh={() =>
									onRefreshModels({ apiKey: apiKeyDraft || undefined, baseUrl: showsBaseUrl && ownProvider ? slotBaseUrl : undefined })
								}
								catalogue={!(ownProvider && isCustom)}
								disabled={saving || locks.model}
								placeholder={ownProvider ? 'Select a model' : defaultModel ? `Same as default (${defaultModel})` : 'Same as default'}
							/>
						</div>
						{!ownProvider && model && !locks.model && (
							<Button type="button" variant="outline" disabled={saving} onClick={() => setModel('')}>
								Use Default
							</Button>
						)}
					</div>
					{locks.model && <p className="text-xs text-muted-foreground">Set by {prefix}_MODEL. Unset to edit here.</p>}
				</div>

				{rate && trimmedModel && (!rate.isKnown(trimmedModel) || rate.valueFor(trimmedModel)) && (
					<ModelRateFields
						key={trimmedModel}
						slot={slot}
						model={trimmedModel}
						value={rate.valueFor(trimmedModel)}
						pending={rate.pending}
						onSave={next => rate.onSave(trimmedModel, next)}
					/>
				)}

				<Separator />

				<div className="flex flex-wrap items-center gap-2">
					<SlotTestButton
						slot={slot}
						disabled={!canTest || saving}
						run={() =>
							onTest({
								slot,
								ownProvider,
								...(ownProvider ? { providerType: slotProviderType } : {}),
								...(ownProvider && showsBaseUrl && slotBaseUrl ? { baseUrl: slotBaseUrl } : {}),
								...(apiKeyDraft ? { apiKey: apiKeyDraft } : {}),
								...(trimmedModel ? { model: trimmedModel } : {}),
							})
						}
					/>
					<div className="ml-auto flex items-center gap-2">
						{hasSavedValue && (
							<Button type="button" variant="outline" disabled={saving} onClick={() => onSave({ slot, model: null, provider: null })}>
								Clear
							</Button>
						)}
						<Button type="button" disabled={!dirty || !complete || saving} onClick={handleSave}>
							{saving ? 'Saving…' : 'Save'}
						</Button>
					</div>
				</div>
				{dirty && missing && <p className="text-xs text-destructive">{missing}</p>}
				{anyLocked && !modeLocked && (
					<p className="text-xs text-muted-foreground">
						Some fields are set by {prefix}_* environment variables and can&apos;t be edited here.
					</p>
				)}
			</CardContent>
		</Card>
	)
}

function SlotTestButton({ slot, disabled, run }: { slot: AiExtraSlot; disabled: boolean; run: () => Promise<TestAiConnectionResult> }) {
	const [testing, setTesting] = useState(false)
	const [result, setResult] = useState<TestAiConnectionResult | null>(null)

	const handleClick = async () => {
		setTesting(true)
		setResult(null)
		try {
			setResult(await run())
		} catch (err) {
			setResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' })
		} finally {
			setTesting(false)
		}
	}

	const Icon = !result || testing ? <Sparkles /> : result.ok ? <CheckIcon /> : <XIcon />

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2">
			<Button type="button" variant="outline" className="gap-2" disabled={disabled || testing} onClick={handleClick}>
				{Icon}
				{testing ? 'Testing…' : slot === 'vision' ? 'Test with an Image' : 'Test'}
			</Button>
			{result?.ok === true && <span className="text-sm text-muted-foreground">OK ({result.latencyMs} ms)</span>}
			{result?.ok === false && <span className="text-sm text-destructive break-words">{result.error}</span>}
		</div>
	)
}

function parsePrice(raw: string): number | null {
	if (!/^\d+(\.\d+)?$/.test(raw.trim())) return null
	const n = Number(raw)
	return n >= 0 && n <= 10_000 ? n : null
}

// Prices for a model the built-in cost table does not know. Without them
// the usage estimate (and the monthly ceiling) assumes a mid-priced model.
function ModelRateFields({
	slot,
	model,
	value,
	pending,
	onSave,
}: {
	slot: AiExtraSlot
	model: string
	value: ModelRate | undefined
	pending: boolean
	onSave: (rate: ModelRate | null) => void
}) {
	const [input, setInput] = useState(value ? String(value.inPerMTok) : '')
	const [output, setOutput] = useState(value ? String(value.outPerMTok) : '')

	useEffect(() => {
		setInput(value ? String(value.inPerMTok) : '')
		setOutput(value ? String(value.outPerMTok) : '')
	}, [value])

	const inParsed = parsePrice(input)
	const outParsed = parsePrice(output)
	const empty = input.trim() === '' && output.trim() === ''
	const valid = empty || (inParsed !== null && outParsed !== null)
	const dirty = empty ? value !== undefined : !value || inParsed !== value.inPerMTok || outParsed !== value.outPerMTok

	return (
		<div className="flex flex-col gap-2">
			<div className="space-y-0.5">
				<p className="text-base font-medium">Price</p>
				<p className="text-sm text-muted-foreground">
					Optional. <span className="font-mono text-xs">{model}</span> isn&apos;t in the built-in price list, so usage estimates and the
					monthly ceiling assume $3 in and $15 out per 1M tokens unless you enter its price.
				</p>
			</div>
			<div className="flex flex-wrap items-end gap-2">
				<div className="flex flex-col gap-1">
					<Label htmlFor={`${slot}-rate-in`} className="text-xs text-muted-foreground">
						Input $ per 1M tokens
					</Label>
					<Input
						id={`${slot}-rate-in`}
						inputMode="decimal"
						className="w-36"
						value={input}
						placeholder="3"
						disabled={pending}
						onChange={e => setInput(e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor={`${slot}-rate-out`} className="text-xs text-muted-foreground">
						Output $ per 1M tokens
					</Label>
					<Input
						id={`${slot}-rate-out`}
						inputMode="decimal"
						className="w-36"
						value={output}
						placeholder="15"
						disabled={pending}
						onChange={e => setOutput(e.target.value)}
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					disabled={!dirty || !valid || pending}
					onClick={() => onSave(empty ? null : { inPerMTok: inParsed!, outPerMTok: outParsed! })}
				>
					Save Price
				</Button>
			</div>
			{!valid && <p className="text-xs text-destructive">Enter both prices as numbers, or leave both empty.</p>}
		</div>
	)
}
