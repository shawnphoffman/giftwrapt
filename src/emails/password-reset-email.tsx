import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.SERVER_URL || 'http://localhost:3000'

type Props = {
	name?: string | null
	resetUrl: string
	// Minutes until the link expires. Mirrors better-auth's
	// `forgetPassword` token TTL so the email tells the truth.
	expiresInMinutes: number
}

export function PasswordResetEmail({ name, resetUrl, expiresInMinutes }: Props) {
	const greeting = name?.trim() ? name.trim() : 'there'
	return (
		<Html>
			<Head />
			<Preview>Reset your GiftWrapt password</Preview>
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt="GiftWrapt" className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">Reset your password</Heading>
						<Text className="text-[14px] text-black leading-[24px]">Hi {greeting},</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							Someone (hopefully you) asked to reset the password on your GiftWrapt account. Click the button below to choose a new
							password. The link is good for {expiresInMinutes} minutes.
						</Text>
						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={resetUrl}
							>
								Reset password
							</Button>
						</Section>
						<Text className="text-[12px] text-[#525252] leading-[20px] mt-6">
							If the button doesn't work, paste this URL into your browser:
							<br />
							<span className="break-all">{resetUrl}</span>
						</Text>
						<Hr className="border-[#eaeaea] my-[26px] mx-0 w-full border border-solid" />
						<Text className="text-[12px] text-[#525252] leading-[20px]">
							If you didn't request a password reset you can safely ignore this email. Your password won't change.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PasswordResetEmail.PreviewProps = {
	name: 'Sam',
	resetUrl: 'https://giftwrapt.app/reset-password?token=preview-token',
	expiresInMinutes: 60,
} satisfies Props

export default PasswordResetEmail
