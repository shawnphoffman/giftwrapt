import type { LanguageModel } from 'ai'

import type { Database } from '@/db'
import type { AppSettings } from '@/lib/settings'

// Subject the current pass is generating recs for. When `kind: 'user'` the
// pass behaves as today: the user's own lists with `subjectDependentId IS
// NULL`. When `kind: 'dependent'`, the analyzer scopes to lists where
// `subjectDependentId = subject.id` and the rec UI renders the dependent's
// avatar/name as the recipient identity.
export type AnalyzerSubject =
	| { kind: 'user'; name: string; image: string | null }
	| { kind: 'dependent'; id: string; name: string; image: string | null }

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
	// When set, the analyzer scopes to the named dependent's lists
	// (lists.subjectDependentId = ctx.dependentId AND lists.ownerId =
	// ctx.userId). When null, the analyzer scopes to the user's own lists
	// (subjectDependentId IS NULL). Either way, the giftideas, isActive,
	// and items.isArchived filters still apply.
	dependentId: string | null
	// Recipient identity for any ListRefs the analyzer emits. The runner
	// resolves this once when constructing the context: 'You' for the
	// user pass, the dependent's name+image for a dependent pass.
	subject: AnalyzerSubject
}
