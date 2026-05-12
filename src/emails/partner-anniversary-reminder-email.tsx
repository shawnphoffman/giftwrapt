import { Body, Container, Head, Heading, Html, Img, Link, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface PartnerAnniversaryReminderEmailProps {
	name: string
	partnerName: string
	leadDays: number
}

export default function PartnerAnniversaryReminderEmail({ name, partnerName, leadDays }: PartnerAnniversaryReminderEmailProps) {
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">{`Your anniversary with ${partnerName} is in ${leadDays} days`}</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							{name}, your anniversary with {partnerName} is coming up. Take a look at their list at{' '}
							<Link href={`${baseUrl}`}>All Lists</Link>.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PartnerAnniversaryReminderEmail.PreviewProps = {
	name: 'Alex',
	partnerName: 'Casey',
	leadDays: 7,
} as PartnerAnniversaryReminderEmailProps
