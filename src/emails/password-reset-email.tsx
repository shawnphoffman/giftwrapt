import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Tailwind, Text } from 'react-email'

import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'
const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

type Props = {
	name?: string | null
	resetUrl: string
	// Minutes until the link expires. Mirrors better-auth's
	// `forgetPassword` token TTL so the email tells the truth.
	expiresInMinutes: number
	locale?: Locale
	appTitle?: string
}

export function PasswordResetEmail({ name, resetUrl, expiresInMinutes, locale = 'en', appTitle = 'GiftWrapt' }: Props) {
	const o = { locale }
	const trimmed = name?.trim()
	return (
		<Html lang={locale}>
			<Head />
			<Preview>{m.emails_reset_subject({ appTitle }, o)}</Preview>
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">{m.emails_reset_heading({}, o)}</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							{trimmed ? m.emails_reset_hi_name({ name: trimmed }, o) : m.emails_reset_hi_anon({}, o)}
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">{m.emails_reset_body({ appTitle, expiresInMinutes }, o)}</Text>
						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={resetUrl}
							>
								{m.emails_reset_button({}, o)}
							</Button>
						</Section>
						<Text className="text-[12px] text-[#525252] leading-[20px] mt-6">
							{m.emails_reset_paste({}, o)}
							<br />
							<span className="break-all">{resetUrl}</span>
						</Text>
						<Hr className="border-[#eaeaea] my-[26px] mx-0 w-full border border-solid" />
						<Text className="text-[12px] text-[#525252] leading-[20px]">{m.emails_reset_ignore({}, o)}</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PasswordResetEmail.PreviewProps = {
	locale: previewLocale,
	name: 'Sam',
	resetUrl: 'https://giftwrapt.app/reset-password?token=preview-token',
	expiresInMinutes: 60,
} satisfies Props

export default PasswordResetEmail
