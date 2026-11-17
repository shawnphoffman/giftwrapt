// Per-step cost estimate keyed off the model name that actually ran the
// step. Cached input tokens bill at roughly a tenth of the input rate on
// providers that support prefix caching, so they're discounted here too.
// The rate table matches on model-name substrings so it works across the
// provider-configurable model ids; unknown names fall back to a
// Sonnet-ish ballpark. Still an estimate — good enough for the admin
// "cost / day" rollup, not a billing source of truth.
const MODEL_RATES: Array<{ match: RegExp; inPerMTok: number; outPerMTok: number }> = [
	{ match: /haiku/i, inPerMTok: 1, outPerMTok: 5 },
	{ match: /sonnet/i, inPerMTok: 3, outPerMTok: 15 },
	{ match: /opus/i, inPerMTok: 5, outPerMTok: 25 },
]
const FALLBACK_RATE = { inPerMTok: 3, outPerMTok: 15 }
const CACHED_READ_MULTIPLIER = 0.1

export type ModelRate = { inPerMTok: number; outPerMTok: number }
// Admin-entered prices keyed by exact model name (the `aiModelRates`
// setting). They win over the built-in table.
export type ModelRates = Readonly<Record<string, ModelRate | undefined>>

function customRateFor(model: string, rates: ModelRates | undefined): ModelRate | undefined {
	if (!rates) return undefined
	const exact = rates[model]
	if (exact) return exact
	const wanted = model.trim().toLowerCase()
	for (const [name, rate] of Object.entries(rates)) {
		if (rate && name.trim().toLowerCase() === wanted) return rate
	}
	return undefined
}

// True when the estimate for this model comes from a real price (an admin
// entry or the built-in table) rather than the fallback.
export function hasKnownRate(model: string, rates?: ModelRates): boolean {
	return Boolean(customRateFor(model, rates)) || MODEL_RATES.some(r => r.match.test(model))
}

export function estimateStepCostMicroUsd(
	model: string | null,
	step: { tokensIn?: number; tokensOut?: number; cachedInputTokens?: number },
	customRates?: ModelRates
): number {
	const tokensIn = step.tokensIn ?? 0
	const tokensOut = step.tokensOut ?? 0
	// Clamp: provider-reported cached counts are a subset of tokensIn, but
	// don't let a misreporting provider drive the estimate negative.
	const cachedIn = Math.min(step.cachedInputTokens ?? 0, tokensIn)
	const rate = (model && (customRateFor(model, customRates) ?? MODEL_RATES.find(r => r.match.test(model)))) || FALLBACK_RATE
	const inCost = ((tokensIn - cachedIn) / 1_000_000) * rate.inPerMTok
	const cachedCost = (cachedIn / 1_000_000) * rate.inPerMTok * CACHED_READ_MULTIPLIER
	const outCost = (tokensOut / 1_000_000) * rate.outPerMTok
	// Micro-USD (USD * 1_000_000) avoids float drift on the integer column.
	return (inCost + cachedCost + outCost) * 1_000_000
}
