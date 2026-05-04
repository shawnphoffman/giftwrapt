import type { Analyzer } from './analyzer'
import { duplicatesAnalyzer } from './analyzers/duplicates'
import { groupingAnalyzer } from './analyzers/grouping'
import { primaryListAnalyzer } from './analyzers/primary-list'
import { staleItemsAnalyzer } from './analyzers/stale-items'

// Order is the order analyzers run + the order recs surface within their
// severity bucket on the user-facing page. Setup-style analyzers go first.
export const ANALYZERS: ReadonlyArray<Analyzer> = [primaryListAnalyzer, staleItemsAnalyzer, duplicatesAnalyzer, groupingAnalyzer]

export function getAnalyzer(id: string): Analyzer | undefined {
	return ANALYZERS.find(a => a.id === id)
}

export function isAnalyzerEnabled(analyzer: Analyzer, overrides: Record<string, boolean> | undefined): boolean {
	if (overrides && Object.hasOwn(overrides, analyzer.id)) return overrides[analyzer.id]
	return analyzer.enabledByDefault
}
