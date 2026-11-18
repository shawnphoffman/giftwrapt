import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Star } from 'lucide-react'

import { getMyLists } from '@/api/lists'
import { RichMessage } from '@/components/common/rich-message'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'

function PrimaryListNudgeContent() {
	const { data: myLists } = useQuery({
		queryKey: ['my-lists'],
		queryFn: () => getMyLists(),
	})

	if (!myLists) return null

	const candidates = [...myLists.public, ...myLists.private].filter(l => l.isActive)
	if (candidates.length === 0) return null
	if (candidates.some(l => l.isPrimary)) return null

	return (
		<Alert variant="warning">
			<Star className="size-4 fill-current" />
			<AlertTitle>{m.lists_primary_nudge_title()}</AlertTitle>
			<AlertDescription>
				<RichMessage
					parts={m.lists_primary_nudge_body.parts()}
					tags={{
						icon: () => (
							<MoreHorizontal className="inline size-3.5 align-text-bottom" aria-label={m.lists_primary_nudge_menu_icon_label()} />
						),
					}}
				/>
			</AlertDescription>
		</Alert>
	)
}

export function PrimaryListNudge() {
	return (
		<ClientOnly>
			<PrimaryListNudgeContent />
		</ClientOnly>
	)
}
