// Server-only. Do not import from client/route components.
//
// Browserbase + Stagehand provider: drives a real Browserbase browser session
// and uses Stagehand's `page.extract()` to return a structured ScrapeResult
// shaped to our existing schema. Slow and LLM-billable, so admins typically
// place it at a higher tier (default tier 3) so it only fires when cheaper
// tiers fall through.
//
// Best for sites where the Fetch API returns empty HTML or where the
// extractor consistently misses fields. Like every other entry, this only
// runs when the admin has added one and enabled it under /admin/scraping.
//
// `@browserbasehq/stagehand` is **lazily imported** inside `fetch()` so
// the dep (and its transitive `playwright-core`) only loads when at least
// one Stagehand entry actually runs. Adding the dep but never enabling
// the provider has zero startup cost.

// Type-only import: erased at compile time so it doesn't pull the SDK
// into the static graph. The actual module load happens via `await
// import('@browserbasehq/stagehand')` inside the runtime branch below.
import type { Stagehand as StagehandType } from '@browserbasehq/stagehand'

import { db } from '@/db'
import { resolveAiConfig } from '@/lib/ai-config'
import type { BrowserbaseStagehandEntry } from '@/lib/settings'

import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError, type ScrapeResult, scrapeResultSchema } from '../types'

const PROVIDER_TYPE = 'browserbase-stagehand'

const DEFAULT_INSTRUCTION =
	"Extract the product's title, description, current price as a string, ISO currency code, the main product image URLs (absolute), and the site's display name. Use the page's canonical product info, not navigational chrome."

export function browserbaseStagehandProviderId(entryId: string): string {
	return `${PROVIDER_TYPE}:${entryId}`
}

export function createBrowserbaseStagehandProvider(entry: BrowserbaseStagehandEntry): ScrapeProvider {
	const providerId = browserbaseStagehandProviderId(entry.id)
	return {
		id: providerId,
		name: entry.name,
		kind: 'structured',
		tier: entry.tier,
		timeoutMs: entry.timeoutMs,
		isAvailable: () => entry.enabled && entry.apiKey.trim().length > 0 && entry.projectId.trim().length > 0,
		fetch: ctx => runBrowserbaseStagehandProvider(ctx, entry, providerId),
	}
}

async function runBrowserbaseStagehandProvider(
	ctx: ScrapeContext,
	entry: BrowserbaseStagehandEntry,
	providerId: string
): Promise<ProviderResponse> {
	if (!entry.apiKey) throw new ScrapeProviderError('config_missing', `${entry.name} apiKey is empty`)
	if (!entry.projectId) throw new ScrapeProviderError('config_missing', `${entry.name} projectId is empty`)

	// Resolve LLM creds: prefer the entry's explicit modelName when set;
	// otherwise fall back to the app's AI config (provider + key + model).
	// Stagehand needs both a model name AND an LLM API key to drive
	// extract(); without them we bail early so the orchestrator records a
	// clean `config_missing` instead of letting Stagehand throw something
	// opaque mid-session.
	const aiConfig = await resolveAiConfig(db)
	const modelName = entry.modelName ?? aiConfig.model.value
	const llmApiKey = aiConfig.apiKey.value
	if (!modelName) {
		throw new ScrapeProviderError('config_missing', `${entry.name} requires a modelName (set on the entry or in /admin/ai-settings)`)
	}
	if (!llmApiKey) {
		throw new ScrapeProviderError('config_missing', `${entry.name} requires an LLM API key (configure /admin/ai-settings)`)
	}

	const start = Date.now()

	// Lazy-load Stagehand. Pulling `@browserbasehq/stagehand` (which
	// transitively loads `playwright-core`) is heavy; do it only when an
	// admin actually enables this provider.
	let StagehandCtor: typeof StagehandType
	try {
		const mod = await import('@browserbasehq/stagehand')
		StagehandCtor = mod.Stagehand
	} catch (err) {
		throw new ScrapeProviderError(
			'config_missing',
			`${entry.name} could not load @browserbasehq/stagehand. Install it (or enable the optional dep) to use Stagehand.`
		)
	}

	const stagehand = new StagehandCtor({
		env: 'BROWSERBASE',
		apiKey: entry.apiKey,
		projectId: entry.projectId,
		modelName,
		modelClientOptions: { apiKey: llmApiKey },
	})

	try {
		await raceWithAbort(stagehand.init(), ctx.signal)
		await raceWithAbort(stagehand.page.goto(ctx.url, { waitUntil: 'domcontentloaded', timeout: ctx.perAttemptTimeoutMs }), ctx.signal)
		// Stagehand's extract() expects a Zod v3 AnyZodObject for its schema
		// argument. We pass our Zod v4 ScrapeResult schema across the API
		// boundary (cast through `any` since the internal type signatures
		// differ between zod major versions) and then re-validate the result
		// with our schema below to get a typed value back.
		const extracted = await raceWithAbort(
			stagehand.page.extract({
				instruction: entry.instruction?.trim() || DEFAULT_INSTRUCTION,

				schema: scrapeResultSchema as any,
			}),
			ctx.signal
		)

		const parsed = scrapeResultSchema.safeParse(extracted)
		if (!parsed.success) {
			throw new ScrapeProviderError('invalid_response', `${entry.name} extract() returned data that didn't match ScrapeResult shape`)
		}

		const result: ScrapeResult = { ...parsed.data, finalUrl: parsed.data.finalUrl ?? ctx.url }
		return {
			kind: 'structured',
			providerId,
			result,
			fetchMs: Date.now() - start,
		}
	} catch (err) {
		if (err instanceof ScrapeProviderError) throw err
		throw mapStagehandError(err, entry.name)
	} finally {
		// Sessions cost minutes; never leak one. Swallow close errors so a
		// failed session teardown doesn't mask the real fetch error.
		try {
			await stagehand.close()
		} catch {
			// ignore
		}
	}
}

function mapStagehandError(err: unknown, entryName: string): ScrapeProviderError {
	const message = err instanceof Error ? err.message : String(err)
	if (/abort|cancel/i.test(message)) {
		return new ScrapeProviderError('timeout', `${entryName} aborted: ${message}`)
	}
	if (/timeout/i.test(message)) {
		return new ScrapeProviderError('timeout', `${entryName} timed out: ${message}`)
	}
	if (/auth|unauthorized|forbidden|401|403/i.test(message)) {
		return new ScrapeProviderError('config_missing', `${entryName} auth rejected: ${message}`)
	}
	return new ScrapeProviderError('unknown', `${entryName}: ${message}`)
}

// Stagehand's API methods don't accept an AbortSignal, so we race the
// underlying promise against an abort-rejected promise instead. The session
// is torn down by the `finally` block in the caller, so even when the abort
// wins, no resources are leaked.
async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) throw new Error(signal.reason instanceof Error ? signal.reason.message : 'aborted')
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			signal.removeEventListener('abort', onAbort)
			reject(new Error(signal.reason instanceof Error ? signal.reason.message : 'aborted'))
		}
		signal.addEventListener('abort', onAbort, { once: true })
		promise.then(
			value => {
				signal.removeEventListener('abort', onAbort)
				resolve(value)
			},
			err => {
				signal.removeEventListener('abort', onAbort)
				reject(err)
			}
		)
	})
}
