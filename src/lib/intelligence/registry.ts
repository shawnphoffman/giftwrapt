import type { Analyzer } from './analyzer'
import { clothingPrefsAnalyzer } from './analyzers/clothing-prefs'
import { duplicatesAnalyzer } from './analyzers/duplicates'
import { groupingAnalyzer } from './analyzers/grouping'
import { missingImageAnalyzer } from './analyzers/missing-image'
import { missingPriceAnalyzer } from './analyzers/missing-price'
import { primaryListAnalyzer } from './analyzers/primary-list'
import { relationLabelsAnalyzer } from './analyzers/relation-labels'
import { staleItemsAnalyzer } from './analyzers/stale-items'
import { staleScrapeAnalyzer } from './analyzers/stale-scrape'

// Order is the order analyzers run + the order recs surface within their
// severity bucket on the user-facing page. Setup-style analyzers go first,
// per-item polish analyzers run after the structural ones.
export const ANALYZERS: ReadonlyArray<Analyzer> = [
	primaryListAnalyzer,
	relationLabelsAnalyzer,
	staleItemsAnalyzer,
	duplicatesAnalyzer,
	groupingAnalyzer,
	missingPriceAnalyzer,
	missingImageAnalyzer,
	staleScrapeAnalyzer,
	clothingPrefsAnalyzer,
]

export function getAnalyzer(id: string): Analyzer | undefined {
	return ANALYZERS.find(a => a.id === id)
}

export function isAnalyzerEnabled(analyzer: Analyzer, overrides: Record<string, boolean> | undefined): boolean {
	if (overrides && Object.hasOwn(overrides, analyzer.id)) return overrides[analyzer.id]
	return analyzer.enabledByDefault
}
