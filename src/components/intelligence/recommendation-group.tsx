import { Brush, ListChecks, Settings2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import type { RecGroupKey, Recommendation, RecommendationAction } from './__fixtures__/types'
import { RecommendationCard } from './recommendation-card'

type Props = {
	groupKey: RecGroupKey
	recs: Array<Recommendation>
	onAction?: (rec: Recommendation, action: RecommendationAction) => void
	onDismiss?: (rec: Recommendation) => void
}

// Label and description are functions so they are worded at render, in the
// language of the page, not once when this module loads.
const GROUP_META: Record<
	RecGroupKey,
	{ label: () => string; description: () => string; icon: React.ComponentType<{ className?: string }> }
> = {
	setup: { label: () => m.intelligence_group_setup(), description: () => m.intelligence_group_setup_description(), icon: Settings2 },
	cleanup: { label: () => m.intelligence_group_cleanup(), description: () => m.intelligence_group_cleanup_description(), icon: Brush },
	organize: {
		label: () => m.intelligence_group_organize(),
		description: () => m.intelligence_group_organize_description(),
		icon: ListChecks,
	},
}

export function groupKeyForAnalyzer(analyzerId: Recommendation['analyzerId']): RecGroupKey {
	if (analyzerId === 'primary-list') return 'setup'
	if (
		analyzerId === 'stale-items' ||
		analyzerId === 'missing-price' ||
		analyzerId === 'missing-image' ||
		analyzerId === 'stale-scrape' ||
		analyzerId === 'clothing-prefs'
	) {
		return 'cleanup'
	}
	return 'organize'
}

// Per-rec group resolver. Mirrors categoryLabelFor in recommendation-card.tsx:
// most recs are bucketed by analyzer, but `kind: 'group-suggestion'` always
// belongs under Organize even when it originated from stale-items
// (the AI flagged co-listed items as alternatives -> "pick one" group).
export function groupKeyFor(rec: Pick<Recommendation, 'analyzerId' | 'kind'>): RecGroupKey {
	if (rec.kind === 'group-suggestion') return 'organize'
	return groupKeyForAnalyzer(rec.analyzerId)
}

export function RecommendationGroup({ groupKey, recs, onAction, onDismiss }: Props) {
	const meta = GROUP_META[groupKey]
	const Icon = meta.icon
	const activeCount = recs.filter(r => r.status === 'active').length

	return (
		<section data-intelligence="rec-group" data-group-key={groupKey} className="flex flex-col gap-3">
			<header data-intelligence="rec-group-header" className="flex items-center gap-3">
				<div className={cn('flex size-9 items-center justify-center rounded-lg bg-muted/40 ring-1 ring-border')}>
					<Icon className="size-4" />
				</div>
				<div className="flex flex-col flex-1">
					<div className="flex items-baseline gap-2">
						<h2 className="text-base font-semibold">{meta.label()}</h2>
						<span className="text-xs text-muted-foreground">{m.intelligence_group_counts({ activeCount, totalCount: recs.length })}</span>
					</div>
					<p className="text-xs text-muted-foreground">{meta.description()}</p>
				</div>
			</header>
			<div data-intelligence="rec-group-cards" className="flex flex-col gap-2.5">
				{recs.map(rec => (
					<RecommendationCard key={rec.id} rec={rec} onAction={onAction} onDismiss={onDismiss} />
				))}
			</div>
		</section>
	)
}
