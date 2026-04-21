import { Body, Container, Head, Heading, Html, Img, Preview, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.SERVER_URL || 'http://localhost:3000'

interface BirthdayEmailProps {
	name: string
}

export default function BirthdayEmail({ name }: BirthdayEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>Happy Birthday, {name}!</Preview>
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="Wish Lists" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">🎉 Happy Birthday, {name}! 🎉</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							In case you forgot, today is your birthday! We hope you have a great day and all of your birthday wishes come true.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

BirthdayEmail.PreviewProps = {
	name: 'Shawn',
} as BirthdayEmailProps
