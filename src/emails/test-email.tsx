import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Tailwind, Text } from 'react-email'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

export function TestEmail() {
	return (
		<Html>
			<Head />
			<Preview>Test Email</Preview>
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
							Hello <strong>Test User</strong>!
						</Text>

						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={baseUrl}
							>
								View Site
							</Button>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

TestEmail.PreviewProps = {}

export default TestEmail
