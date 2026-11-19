import { Body, Container, Head, Heading, Html, Img, Link, Section, Tailwind, Text } from 'react-email'

import { RichMessage } from '../components/common/rich-message'
import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'
const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface PreBirthdayReminderEmailProps {
	name: string
	leadDays: number
	locale?: Locale
	appTitle?: string
}

export default function PreBirthdayReminderEmail({ name, leadDays, locale = 'en', appTitle = 'GiftWrapt' }: PreBirthdayReminderEmailProps) {
	const o = { locale }
	return (
		<Html lang={locale}>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">
							{m.emails_pre_birthday_heading({ leadDays, name }, o)}
						</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							<RichMessage parts={m.emails_pre_birthday_body.parts({}, o)} tags={{ link: c => <Link href={`${baseUrl}/me`}>{c}</Link> }} />
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

PreBirthdayReminderEmail.PreviewProps = {
	locale: previewLocale,
	name: 'Alex',
	leadDays: 30,
} as PreBirthdayReminderEmailProps
