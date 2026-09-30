import { Body, Column, Container, Head, Heading, Hr, Html, Img, Link, Row, Section, Tailwind, Text } from 'react-email'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

export interface RevealSummaryItem {
	title: string
	image_url: string
	// Pre-formatted (e.g. "Alice & Bob" or "Alice, Bob & Carol") so partner
	// and co-gifter attribution stays consistent with the received gifts
	// page. See src/lib/gifters.ts#formatGifterNames.
	gifters: string
	// An off-list gift (list addon) rather than an item from the list.
	offList?: boolean
}

export interface RevealSummarySection {
	listName: string
	items: Array<RevealSummaryItem>
}

interface RevealSummaryEmailProps {
	// Occasion-specific opening line (e.g. "We hope your Christmas was
	// wonderful."). Omitted when one email covers more than one occasion.
	intro?: string
	// One section per list revealed in this run.
	sections: Array<RevealSummarySection>
	appTitle?: string
}

// The "here's who gave you what" email sent when a list's gifts are
// revealed. One template for every occasion (birthday, Christmas, custom
// holidays); it lists exactly the items and off-list gifts that reveal
// uncovered.
export default function RevealSummaryEmail({ intro, sections, appTitle = 'GiftWrapt' }: RevealSummaryEmailProps) {
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[650px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[20px] p-0 font-bold text-[24px] text-black text-center">A look back...</Heading>
						<Text className="text-base text-center">{intro ? `${intro} ` : ''}Here&apos;s who gave you what.</Text>
						{sections.map((section, sectionIndex) => (
							<Section key={sectionIndex}>
								<Text className="mt-[24px] mb-[4px] text-sm font-bold uppercase tracking-wide text-[#666666]">{section.listName}</Text>
								<Hr />
								{section.items.map((item, index) => (
									<Section key={index}>
										<Row className="flex flex-row items-center justify-center w-full">
											<Column className="w-20 px-2">
												<Img src={item.image_url} width="80" height="80" alt="" className="mx-auto my-0" />
											</Column>
											<Column className="gap-2">
												<Text className="my-0 text-base font-bold leading-tight">{item.title}</Text>
												<Text className="my-0 text-sm">
													From: {item.gifters}
													{item.offList ? ' (off-list gift)' : ''}
												</Text>
											</Column>
										</Row>
										<Hr />
									</Section>
								))}
							</Section>
						))}
						<Text className="text-sm text-center text-black">
							These gifts have been archived and can be found on your <Link href={`${baseUrl}/purchases/received`}>Received Gifts</Link>{' '}
							page.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

RevealSummaryEmail.PreviewProps = {
	intro: 'We hope you had a wonderful birthday.',
	sections: [
		{
			listName: 'Birthday 2026',
			items: [
				{
					title: 'Item 1 is really long and should definitely behave properly in the email',
					image_url: 'https://placehold.co/600x400',
					gifters: 'John & Jane',
				},
				{ title: 'Item 2', image_url: 'https://placehold.co/100x200', gifters: 'John' },
			],
		},
		{
			listName: 'Wishlist',
			items: [
				{ title: 'Item 3', image_url: 'https://placehold.co/400x200', gifters: 'Jane, Alex & Priya' },
				{ title: 'Homemade jam', image_url: 'https://placehold.co/80x80?text=Gift', gifters: 'Priya', offList: true },
			],
		},
	],
} as RevealSummaryEmailProps
