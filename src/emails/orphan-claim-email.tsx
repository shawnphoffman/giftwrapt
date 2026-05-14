import { Body, Button, Container, Head, Heading, Html, Img, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface OrphanClaimEmailProps {
	username?: string
	itemTitle?: string
	itemImageUrl?: string | null
	recipientName?: string
	listId?: number
	listName?: string
}

export function OrphanClaimEmail({ username, itemTitle, itemImageUrl, recipientName, listId, listName }: OrphanClaimEmailProps) {
	const listUrl = listId ? `${baseUrl}/lists/${listId}` : `${baseUrl}/purchases`
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">An item you claimed was removed</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							Hello <strong>{username}</strong>,
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							{recipientName ? <strong>{recipientName}</strong> : 'The recipient'} removed <em>{itemTitle}</em> from{' '}
							<strong>{listName}</strong>. You (or your partner) had already claimed it. They were never told you claimed it, so they
							don&apos;t know that you may have already purchased the gift.
						</Text>
						{itemImageUrl && (
							<Section className="mt-4 text-center">
								<Img src={itemImageUrl} width="120" height="120" alt={itemTitle} className="mx-auto my-0 rounded" />
							</Section>
						)}
						<Text className="text-[14px] text-black leading-[24px]">
							You may want to return the item, hold onto it for another occasion, or give it anyway. Once you&apos;ve decided, head into the
							app to acknowledge the alert and clear the item from your view.
						</Text>
						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={listUrl}
							>
								View on the list
							</Button>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

OrphanClaimEmail.PreviewProps = {
	username: 'Shawn',
	itemTitle: 'Vintage espresso machine',
	itemImageUrl: 'https://placehold.co/120x120',
	recipientName: 'Madison',
	listId: 45,
	listName: "Madison's Wishlist",
} as OrphanClaimEmailProps

export default OrphanClaimEmail
