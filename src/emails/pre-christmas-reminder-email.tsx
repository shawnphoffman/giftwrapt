import { Body, Container, Head, Heading, Html, Img, Link, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface PreChristmasReminderEmailProps {
	name: string
	leadDays: number
}

export default function PreChristmasReminderEmail({ name, leadDays }: PreChristmasReminderEmailProps) {
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">{`Christmas is in ${leadDays} days, ${name}`}</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							Time to spruce up your Christmas list. Add anything new, drop what you've outgrown, and make it easier for the people shopping
							for you. Head to <Link href={`${baseUrl}/me`}>My Lists</Link> to review.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PreChristmasReminderEmail.PreviewProps = {
	name: 'Alex',
	leadDays: 30,
} as PreChristmasReminderEmailProps
