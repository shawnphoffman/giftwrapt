import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'

import { revealChildGiftExchangeAssignment, revealMyGiftExchangeAssignment } from '@/api/my-gift-exchanges'
import { GiftExchangeMemberPage } from '@/components/gift-exchange/gift-exchange-member-page'
import { revealRefusalText } from '@/components/gift-exchange/gift-exchange-text'
import { myGiftExchangesKeys, myGiftExchangesQueryOptions } from '@/lib/queries/gift-exchanges'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/gift-exchange')({
	head: pageHead(() => m.page_gift_exchange()),
	loader: ({ context }) => context.queryClient.ensureQueryData(myGiftExchangesQueryOptions()),
	component: GiftExchangeRoute,
})

function GiftExchangeRoute() {
	const { data } = useSuspenseQuery(myGiftExchangesQueryOptions())
	const queryClient = useQueryClient()
	const refresh = () => queryClient.invalidateQueries({ queryKey: myGiftExchangesKeys.all })

	// Only these two calls count as looking; loading the page never does.
	const reveal = async (exchangeId: string) => {
		try {
			const result = await revealMyGiftExchangeAssignment({ data: { exchangeId } })
			if (result.kind === 'error') toast.error(revealRefusalText(result.reason))
		} catch {
			toast.error(revealRefusalText(undefined))
		}
		await refresh()
	}

	const revealChild = async (exchangeId: string, childUserId: string) => {
		try {
			const result = await revealChildGiftExchangeAssignment({ data: { exchangeId, childUserId } })
			if (result.kind === 'ok') return result.recipient
			toast.error(revealRefusalText(result.reason))
		} catch {
			toast.error(revealRefusalText(undefined))
		}
		await refresh()
		return null
	}

	return <GiftExchangeMemberPage data={data} onReveal={reveal} onRevealChild={revealChild} />
}
