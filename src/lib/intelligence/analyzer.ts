import type { AnalyzerContext } from './context'
import type { AnalyzerResult } from './types'

// Public contract every analyzer implements. New analyzers drop in via
// registry.ts - the runner, persistence, and admin tooling all iterate
// the registry and read string ids, so no DB enum or UI shell needs to
// change to add one.
export type Analyzer = {
	id: string
	label: string
	enabledByDefault: boolean
	run: (ctx: AnalyzerContext) => Promise<AnalyzerResult>
}
