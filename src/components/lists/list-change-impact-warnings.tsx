// Renders the calendar-proximity warning Alert produced by
// `evaluateListChangeImpact`. Extracted so Storybook can exercise every
// warning variant without standing up the whole edit-list form.
//
// Spoiler-safe: the helper never references claim state, and this
// component never displays anything beyond the helper's `warnings` array.

import { CircleHelp } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ListChangeImpactWarning } from '@/lib/list-change-impact'

type Props = {
	warnings: ReadonlyArray<ListChangeImpactWarning>
}

export function ListChangeImpactWarnings({ warnings }: Props) {
	if (warnings.length === 0) return null

	return (
		<Alert>
			<AlertTitle className="flex items-center gap-1.5">
				<span>Heads up</span>
				<Tooltip>
					<TooltipTrigger asChild>
						<button type="button" aria-label="What does this warning mean?" className="text-muted-foreground hover:text-foreground">
							<CircleHelp className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent>
						<p className="max-w-xs text-xs">
							This is a non-blocking notice about how your changes interact with the calendar. You can still save — we just want you to know
							what auto-archive will (and won't) do after.
						</p>
					</TooltipContent>
				</Tooltip>
			</AlertTitle>
			<AlertDescription>
				<ul className="list-disc space-y-1 pl-5">
					{warnings.map((w, i) => (
						<li key={`${w.kind}-${i}`}>{w.text}</li>
					))}
				</ul>
				<p className="text-muted-foreground mt-2 text-xs">These are notices, not blockers — Save is still enabled.</p>
			</AlertDescription>
		</Alert>
	)
}
