import { Body, Column, Container, Head, Heading, Hr, Html, Img, Link, Row, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.SERVER_URL || 'http://localhost:3000'

interface PostBirthdayEmailProps {
	// `gifters` is pre-formatted (e.g. "Alice & Bob" or "Alice, Bob & Carol")
	// so partner and co-gifter attribution stays consistent with the received
	// gifts page. See src/lib/gifters.ts#formatGifterNames.
	items: Array<{ title: string; image_url: string; gifters: string }>
}

export default function PostBirthdayEmail({ items }: PostBirthdayEmailProps) {
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[650px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.png`} width="80" height="80" alt="Wish Lists" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[20px] p-0 font-bold text-[24px] text-black text-center">A look back...</Heading>
						<Text className="text-base text-center">Here&apos;s a quick reference of some of the items that you were gifted.</Text>
						<Hr />
						{items.map((item, index) => (
							<Section key={index}>
								<Row className="flex flex-row items-center justify-center w-full">
									<Column className="w-20 px-2">
										<Img src={item.image_url} width="80" height="80" alt={item.title} className="mx-auto my-0" />
									</Column>
									<Column className="gap-2">
										<Text className="my-0 text-base font-bold leading-tight">{item.title}</Text>
										<Text className="my-0 text-sm">From: {item.gifters}</Text>
									</Column>
								</Row>
								<Hr />
							</Section>
						))}
						<Text className="text-sm text-center text-black">
							These items have been archived for convenience and can be found in the{' '}
							<Link href={`${baseUrl}/settings/received`}>Received Gifts</Link> section.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PostBirthdayEmail.PreviewProps = {
	name: 'Shawn',
	items: [
		{
			title: 'Item 1 is really long and should definitely behave properly in the email',
			image_url: 'https://placehold.co/600x400',
			gifters: 'John & Jane',
		},
		{
			title: 'Item 2',
			image_url: 'https://placehold.co/100x200',
			gifters: 'John',
		},
		{
			title: 'Item 3',
			image_url: 'https://placehold.co/400x200',
			gifters: 'Jane, Alex & Priya',
		},
	],
} as PostBirthdayEmailProps
