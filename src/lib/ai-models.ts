import { createLogger } from '@/lib/logger'

import type { ProviderModel, ProviderType } from './ai-types'

const modelsLog = createLogger('ai-models')

export type ListModelsArgs = {
	providerType: ProviderType
	apiKey: string
	baseUrl?: string
}

export type ListModelsResult = { ok: true; models: Array<ProviderModel>; fetchedAt: number; cached: boolean } | { ok: false; error: string }

const FETCH_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 60 * 60 * 1000

// Cached per provider+endpoint, not per key: the catalogue is a property of
// the provider, and admins re-check it far more often than it changes.
const cache = new Map<string, { fetchedAt: number; models: Array<ProviderModel> }>()

function cacheKey({ providerType, baseUrl }: Pick<ListModelsArgs, 'providerType' | 'baseUrl'>): string {
	return `${providerType}|${baseUrl ?? ''}`
}

export function clearAiModelsCache() {
	cache.clear()
}

function modelsEndpoint(providerType: ProviderType, baseUrl?: string): string {
	switch (providerType) {
		case 'openai':
			return 'https://api.openai.com/v1/models'
		case 'anthropic':
			return 'https://api.anthropic.com/v1/models?limit=100'
		case 'openai-compatible':
			if (!baseUrl) throw new Error('openai-compatible provider requires a baseUrl')
			return `${baseUrl.replace(/\/+$/, '')}/models`
	}
}

function modelsHeaders(providerType: ProviderType, apiKey: string): Record<string, string> {
	if (providerType === 'anthropic') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
	return { Authorization: `Bearer ${apiKey}` }
}

// OpenAI's catalogue is the only one that mixes non-chat endpoints into
// `/v1/models`. Everything else already returns chat models only, so the
// filter stays scoped to that provider rather than guessing for all of them.
const OPENAI_NON_CHAT =
	/(^|[-/])(text-embedding|whisper|tts|dall-e|davinci|babbage|omni-moderation|text-moderation|sora|gpt-image)|-(audio|realtime|transcribe|tts|image)(-|$)/

export function isChatModelId(providerType: ProviderType, id: string): boolean {
	if (providerType !== 'openai') return true
	return !OPENAI_NON_CHAT.test(id)
}

type RawModel = { id?: unknown; display_name?: unknown; name?: unknown; created?: unknown }

// Every provider here speaks the OpenAI list shape: `{ data: [{ id }] }`.
// Anthropic adds `display_name`, OpenRouter adds `name`, OpenAI adds
// `created` (which we use to float newer models to the top).
export function parseModelList(providerType: ProviderType, body: unknown): Array<ProviderModel> {
	const data = (body as { data?: unknown } | null | undefined)?.data
	if (!Array.isArray(data)) return []

	const rows: Array<{ model: ProviderModel; created: number }> = []
	for (const raw of data as Array<RawModel | null | undefined>) {
		if (typeof raw?.id !== 'string' || raw.id.length === 0) continue
		if (!isChatModelId(providerType, raw.id)) continue
		const display = typeof raw.display_name === 'string' ? raw.display_name : typeof raw.name === 'string' ? raw.name : undefined
		rows.push({
			model: display && display !== raw.id ? { id: raw.id, label: display } : { id: raw.id },
			created: typeof raw.created === 'number' ? raw.created : 0,
		})
	}

	rows.sort((a, b) => b.created - a.created || a.model.id.localeCompare(b.model.id))
	return rows.map(r => r.model)
}

async function readError(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { error?: { message?: unknown }; message?: unknown } | null | undefined
		const msg = body?.error?.message ?? body?.message
		if (typeof msg === 'string' && msg.length > 0) return msg
	} catch {
		// fall through to the status line
	}
	return `${res.status} ${res.statusText}`.trim()
}

export async function listProviderModels({
	providerType,
	apiKey,
	baseUrl,
	refresh = false,
}: ListModelsArgs & { refresh?: boolean }): Promise<ListModelsResult> {
	const key = cacheKey({ providerType, baseUrl })
	const hit = cache.get(key)
	if (!refresh && hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
		return { ok: true, models: hit.models, fetchedAt: hit.fetchedAt, cached: true }
	}

	let url: string
	try {
		url = modelsEndpoint(providerType, baseUrl)
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : 'Invalid provider configuration.' }
	}

	try {
		const res = await fetch(url, {
			method: 'GET',
			headers: { ...modelsHeaders(providerType, apiKey), Accept: 'application/json' },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		})
		if (!res.ok) return { ok: false, error: await readError(res) }

		const models = parseModelList(providerType, await res.json())
		if (models.length === 0) return { ok: false, error: 'The provider returned no usable models.' }

		const fetchedAt = Date.now()
		cache.set(key, { fetchedAt, models })
		return { ok: true, models, fetchedAt, cached: false }
	} catch (err) {
		modelsLog.warn({ err, providerType }, 'failed to list provider models')
		if (err instanceof Error && err.name === 'TimeoutError') return { ok: false, error: 'The provider did not respond in time.' }
		return { ok: false, error: err instanceof Error ? err.message : 'Failed to reach the provider.' }
	}
}
