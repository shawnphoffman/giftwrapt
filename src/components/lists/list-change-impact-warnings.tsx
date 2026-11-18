// Renders the calendar-proximity warning Alert produced by
// `evaluateListChangeImpact`. Extracted so Storybook can exercise every
// warning variant without standing up the whole edit-list form.
//
// Spoiler-safe: the helper never references claim state, and this
// component never displays anything beyond the helper's `warnings` array.

import { CircleHelp } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TapTooltip, TapTooltipContent, TapTooltipTrigger } from '@/components/ui/tooltip'
import type { ListChangeImpactWarning } from '@/lib/list-change-impact'
import { m } from '@/paraglide/messages.js'

type Props = {
	warnings: ReadonlyArray<ListChangeImpactWarning>
}

export function ListChangeImpactWarnings({ warnings }: Props) {
	if (warnings.length === 0) return null

	return (
		<Alert>
			<AlertTitle className="flex items-center gap-1.5">
				<span>{m.lists_change_impact_title()}</span>
				<TapTooltip>
					<TapTooltipTrigger asChild>
						<button type="button" aria-label={m.lists_change_impact_help_label()} className="text-muted-foreground hover:text-foreground">
							<CircleHelp className="size-3.5" />
						</button>
					</TapTooltipTrigger>
					<TapTooltipContent>
						<p className="max-w-xs text-xs">{m.lists_change_impact_help_text()}</p>
					</TapTooltipContent>
				</TapTooltip>
			</AlertTitle>
			<AlertDescription>
				<ul className="list-disc space-y-1 pl-5">
					{warnings.map((w, i) => (
						<li key={`${w.kind}-${i}`}>{w.text}</li>
					))}
				</ul>
				<p className="text-muted-foreground mt-2 text-xs">{m.lists_change_impact_footer()}</p>
			</AlertDescription>
		</Alert>
	)
}
