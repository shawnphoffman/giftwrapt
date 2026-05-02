import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Star } from 'lucide-react'

import { getMyLists } from '@/api/lists'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ClientOnly } from '@/components/utilities/client-only'

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
			<AlertTitle>Pick a primary list</AlertTitle>
			<AlertDescription>
				You don't have a primary list set. Open the{' '}
				<MoreHorizontal className="inline size-3.5 align-text-bottom" aria-label="actions menu" /> menu on one of your lists and choose "Set
				as primary" so others know which list to shop from first.
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
