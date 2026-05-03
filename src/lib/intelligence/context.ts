import type { LanguageModel } from 'ai'

import type { Database } from '@/db'
import type { AppSettings } from '@/lib/settings'

// Per-run, per-user context handed to every analyzer. Keep dependencies
// narrow so analyzers stay portable (cron, worker, CLI - same shape).
export type AnalyzerContext = {
	db: Database
	userId: string
	// Resolved AI model. Null when no provider is configured; analyzers
	// that need it should check and bail or fall back to heuristic-only.
	model: LanguageModel | null
	settings: AppSettings
	logger: { info: (...a: Array<unknown>) => void; warn: (...a: Array<unknown>) => void; error: (...a: Array<unknown>) => void }
	now: Date
	candidateCap: number
	// True when admin has flipped on dry-run. Analyzers should still call
	// the model (so we get realistic step logs) but the runner won't
	// persist any rec rows.
	dryRun: boolean
}
