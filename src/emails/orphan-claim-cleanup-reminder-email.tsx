import { Body, Button, Container, Head, Heading, Html, Img, Section, Tailwind, Text } from 'react-email'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface OrphanClaimCleanupReminderEmailProps {
	username?: string
	itemTitle?: string
	recipientName?: string
	eventLabel?: string
	listId?: number
	listName?: string
}

// Sent the day before auto-cleanup when an orphan-claim alert hasn't been
// acknowledged. Auto-cleanup deletes the claim record (and the item, when
// it's the last claim) so the gifter's view is clean by the event date.
export function OrphanClaimCleanupReminderEmail({
	username,
	itemTitle,
	recipientName,
	eventLabel,
	listId,
	listName,
}: OrphanClaimCleanupReminderEmailProps) {
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
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">Cleaning up an unanswered claim</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							Hello <strong>{username}</strong>,
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							{recipientName ? <strong>{recipientName}</strong> : 'The recipient'} removed <em>{itemTitle}</em> from{' '}
							<strong>{listName}</strong> a while back, and you haven&apos;t acknowledged it yet. Tomorrow
							{eventLabel ? ` (${eventLabel})` : ''}, GiftWrapt will automatically clear the claim from your view to keep things tidy.
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							If you&apos;d like to acknowledge it manually first, or just want to confirm what you bought, use the button below.
						</Text>
						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={listUrl}
							>
								Open the list
							</Button>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

OrphanClaimCleanupReminderEmail.PreviewProps = {
	username: 'Shawn',
	itemTitle: 'Vintage espresso machine',
	recipientName: 'Madison',
	eventLabel: "Madison's birthday",
	listId: 45,
	listName: "Madison's Wishlist",
} as OrphanClaimCleanupReminderEmailProps

export default OrphanClaimCleanupReminderEmail
