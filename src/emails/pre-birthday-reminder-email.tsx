import { Body, Container, Head, Heading, Html, Img, Link, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.SERVER_URL || 'http://localhost:3000'

interface PreBirthdayReminderEmailProps {
	name: string
	leadDays: number
}

export default function PreBirthdayReminderEmail({ name, leadDays }: PreBirthdayReminderEmailProps) {
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">{`Your birthday is in ${leadDays} days, ${name}`}</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							Now is a good time to make sure your birthday list doesn't suck. Add or remove items, set priorities, and update anything
							that's gone stale on your <Link href={`${baseUrl}/me`}>My Lists</Link> page.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PreBirthdayReminderEmail.PreviewProps = {
	name: 'Alex',
	leadDays: 30,
} as PreBirthdayReminderEmailProps
