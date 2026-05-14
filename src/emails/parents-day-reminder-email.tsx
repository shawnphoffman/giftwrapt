import { Body, Container, Head, Heading, Html, Img, Link, Section, Tailwind, Text } from 'react-email'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface ParentsDayReminderEmailProps {
	holidayName: string
	leadDays: number
	people: Array<{ name: string }>
}

export default function ParentsDayReminderEmail({ holidayName, leadDays, people }: ParentsDayReminderEmailProps) {
	const formattedNames = formatList(people.map(p => p.name))
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">
							{holidayName} is in {leadDays} days
						</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							You’ve tagged {formattedNames} for {holidayName}. Take a peek at their <Link href={`${baseUrl}/lists`}>lists</Link> if you’re
							still looking for something.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

function formatList(names: ReadonlyArray<string>): string {
	if (names.length === 0) return ''
	if (names.length === 1) return names[0]
	if (names.length === 2) return `${names[0]} and ${names[1]}`
	return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

ParentsDayReminderEmail.PreviewProps = {
	holidayName: "Mother's Day",
	leadDays: 7,
	people: [{ name: 'Mom' }, { name: 'Sandra' }],
} as ParentsDayReminderEmailProps
