import { Body, Container, Head, Heading, Html, Img, Link, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface PostHolidayEmailProps {
	// Display name of the holiday (e.g. "Easter", "Mother's Day"). Used
	// for the heading and subject line; the email itself stays generic
	// so the same template covers every holiday in the catalog.
	holidayName: string
	listName: string
}

export default function PostHolidayEmail({ holidayName, listName }: PostHolidayEmailProps) {
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">{`Happy ${holidayName}!`}</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							We hope your {holidayName} was wonderful. Claimed items on your list <strong>{listName}</strong> have been archived; you can
							see who gifted what on your <Link href={`${baseUrl}/purchases/received`}>Received Gifts</Link> page.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PostHolidayEmail.PreviewProps = {
	holidayName: "Mother's Day",
	listName: 'Mother’s Day Wishes',
} as PostHolidayEmailProps
