import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { getReceivedGifts } from '@/api/received'
import { draftThankYou } from '@/api/thank-you'
import { ReceivedPageContent } from '@/components/received/received-page'
import { ThankYouDraftDialog, type ThankYouDraftState } from '@/components/received/thank-you-draft-dialog'
import { useAppSetting } from '@/hooks/use-app-settings'
import type { GifterUnitGroup } from '@/lib/received-grouping'
import { usePurchasesReceivedSSE } from '@/lib/use-purchases-received-sse'

export const Route = createFileRoute('/(core)/purchases/received')({
	loader: () => getReceivedGifts(),
	component: ReceivedPage,
})

const DRAFT_ERRORS: Partial<Record<string, string>> = {
	'feature-disabled': 'Thank-you drafts are turned off.',
	'not-configured': 'Thank-you drafts are not set up on this site yet.',
	'not-found': 'Those gifts are no longer on your Received page. Refresh and try again.',
	'ai-budget-exceeded': 'AI features are paused for this month.',
	'rate-limited': 'That is a lot of drafts. Try again in a little while.',
	'ai-failed': 'Could not write a draft just now. Try again.',
}

// One note covers at most this many gifts; a giver with more gets a note
// about the most recent ones (the server enforces the same cap).
const MAX_GIFTS_PER_NOTE = 12

function ReceivedPage() {
	usePurchasesReceivedSSE()
	const data = Route.useLoaderData()
	const draftsEnabled = useAppSetting('aiThankYouDraftsEnabled')
	const [target, setTarget] = useState<GifterUnitGroup | null>(null)
	const [state, setState] = useState<ThankYouDraftState>({ phase: 'loading' })

	const draft = async (group: GifterUnitGroup) => {
		setState({ phase: 'loading' })
		try {
			const result = await draftThankYou({
				data: {
					unitKey: group.key,
					gifts: group.rows
						.slice(0, MAX_GIFTS_PER_NOTE)
						.map(r => (r.type === 'item' ? { type: 'item' as const, id: r.itemId } : { type: 'addon' as const, id: r.addonId })),
				},
			})
			if (result.kind === 'ok') setState({ phase: 'ready', note: result.note })
			else setState({ phase: 'error', message: DRAFT_ERRORS[result.reason] ?? 'Could not write a draft just now. Try again.' })
		} catch {
			setState({ phase: 'error', message: 'Could not write a draft just now. Try again.' })
		}
	}

	return (
		<>
			<ReceivedPageContent
				data={data}
				onDraftThankYou={
					draftsEnabled
						? group => {
								setTarget(group)
								void draft(group)
							}
						: undefined
				}
			/>
			{target && (
				<ThankYouDraftDialog
					open
					onOpenChange={open => !open && setTarget(null)}
					giverLabel={target.label}
					state={state}
					onNoteChange={note => setState({ phase: 'ready', note })}
					onRetry={() => void draft(target)}
				/>
			)}
		</>
	)
}
