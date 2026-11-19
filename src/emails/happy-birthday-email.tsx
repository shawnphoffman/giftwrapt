import { Body, Container, Head, Heading, Html, Img, Preview, Section, Tailwind, Text } from 'react-email'

import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'
const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface BirthdayEmailProps {
	// Null or empty when the account has no name.
	name?: string | null
	locale?: Locale
	appTitle?: string
}

export default function BirthdayEmail({ name, locale = 'en', appTitle = 'GiftWrapt' }: BirthdayEmailProps) {
	const o = { locale }
	return (
		<Html lang={locale}>
			<Head />
			<Preview>{name ? m.emails_birthday_preview({ name }, o) : m.emails_birthday_preview_anon({}, o)}</Preview>
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">
							{name ? m.emails_birthday_heading({ name }, o) : m.emails_birthday_heading_anon({}, o)}
						</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">{m.emails_birthday_body({}, o)}</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

BirthdayEmail.PreviewProps = {
	locale: previewLocale,
	name: 'Shawn',
} as BirthdayEmailProps
