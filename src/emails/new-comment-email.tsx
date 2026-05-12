import { Body, Button, Container, Head, Heading, Html, Img, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface TestEmailProps {
	username?: string
	commenter?: string
	itemTitle?: string
	listId?: number
	itemId?: number
	comment?: string
}

export function TestEmail({ username, commenter, listId, itemId, comment, itemTitle }: TestEmailProps) {
	const itemUrl = `${baseUrl}/lists/${listId}#item-${itemId}`
	return (
		<Html>
			<Head />
			{/* <Preview>{previewText}</Preview> */}
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">
							New Comment on GiftWrapt
							{/* Join <strong>{teamName}</strong> on <strong>Vercel</strong> */}
						</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							Hello <strong>{username}</strong>,
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							<strong>{commenter}</strong> has left a comment on one of your items (
							<a className="italic" href={itemUrl}>
								{itemTitle}
							</a>
							).
						</Text>
						<Text className="w-full py-4 text-lg bg-[rgba(0,0,0,.05)] text-center text-black border border-[#eaeaea] border-solid rounded-md">
							&rdquo;{comment}&rdquo;
						</Text>
						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={itemUrl}
							>
								View Item
							</Button>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

TestEmail.PreviewProps = {
	username: 'Shawn',
	commenter: 'Madison',
	comment: 'This is a test comment',
	itemTitle: 'Test Item',
	listId: 45,
	itemId: 1199,
} as TestEmailProps

export default TestEmail
