import { Body, Container, Head, Heading, Html, Img, Link, Section, Tailwind, Text } from 'react-email'

import type { ReminderPickGroup } from '@/lib/cron/reminder-picks'

import { RichMessage } from '../components/common/rich-message'
import { formatList } from '../lib/i18n/format'
import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'
import { ReminderPicks } from './reminder-picks'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface ParentsDayReminderEmailProps {
	holidayName: string
	leadDays: number
	people: Array<{ name: string }>
	locale?: Locale
	appTitle?: string
	// Things still open on the lists of the people this reminder is about,
	// as the reader sees them. Only ever set on the reader's own copy.
	picks?: ReadonlyArray<ReminderPickGroup>
}

export default function ParentsDayReminderEmail({
	holidayName,
	leadDays,
	people,
	appTitle = 'GiftWrapt',
	picks,
	locale = 'en',
}: ParentsDayReminderEmailProps) {
	const o = { locale }
	const names = formatList(
		people.map(p => p.name),
		'conjunction',
		locale
	)
	return (
		<Html lang={locale}>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">
							{m.emails_countdown({ holidayName, leadDays }, o)}
						</Heading>
						<Text className="text-[14px] text-black leading-[24px] text-center">
							<RichMessage
								parts={m.emails_parents_body.parts({ names, holidayName }, o)}
								tags={{ link: c => <Link href={`${baseUrl}/lists`}>{c}</Link> }}
							/>
						</Text>
						<ReminderPicks picks={picks} locale={locale} />
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

ParentsDayReminderEmail.PreviewProps = {
	locale: previewLocale,
	holidayName: "Mother's Day",
	leadDays: 7,
	people: [{ name: 'Mom' }, { name: 'Sandra' }],
} as ParentsDayReminderEmailProps
