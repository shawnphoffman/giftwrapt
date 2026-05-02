import { createFileRoute } from '@tanstack/react-router'

import { getReceivedGifts } from '@/api/received'
import { ReceivedPageContent } from '@/components/received/received-page'

export const Route = createFileRoute('/(core)/purchases/received')({
	loader: () => getReceivedGifts(),
	component: ReceivedPage,
})

function ReceivedPage() {
	const data = Route.useLoaderData()
	return <ReceivedPageContent data={data} />
}
