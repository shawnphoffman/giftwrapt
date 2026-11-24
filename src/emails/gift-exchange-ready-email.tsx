import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Tailwind, Text } from 'react-email'

import { formatCalendarDate, formatCurrency } from '../lib/i18n/format'
import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'
const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

// "Your assignment is ready" for a gift exchange (plan 39). Sent by hand when
// an admin presses Send Emails. It never names anyone but the reader: no
// recipient, no giver, no other member. A guardian's copy of a child's email
// sets `childName` and is worded about the child.
export type GiftExchangeReadyEmailProps = {
	exchangeName: string
	/** An amount in `budgetCurrency`, or null for no budget. */
	budget: number | null
	budgetCurrency: string | null
	/** A calendar date, `YYYY-MM-DD`. */
	giftDate: string
	/** Set on a guardian's copy: the child the email is about. */
	childName?: string | null
	locale?: Locale
	appTitle?: string
}

export default function GiftExchangeReadyEmail({
	exchangeName,
	budget,
	budgetCurrency,
	giftDate,
	childName,
	locale = 'en',
	appTitle = 'GiftWrapt',
}: GiftExchangeReadyEmailProps) {
	const o = { locale }
	const date = formatCalendarDate(giftDate, { dateStyle: 'long' }, locale)
	const amount = budget === null ? null : formatCurrency(budget, budgetCurrency ?? undefined, { wholeWhenRound: true }, locale)
	const heading = childName ? m.emails_exchange_ready_heading_child({ childName }, o) : m.emails_exchange_ready_heading({}, o)
	return (
		<Html lang={locale}>
			<Head />
			<Preview>{heading}</Preview>
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">{heading}</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							{childName
								? m.emails_exchange_ready_body_child({ childName, exchangeName }, o)
								: m.emails_exchange_ready_body({ exchangeName }, o)}
						</Text>
						<Text className="text-[14px] text-black leading-[24px] my-0">{m.emails_exchange_gift_date({ date }, o)}</Text>
						{amount && (
							<Text className="text-[14px] text-black leading-[24px] my-0">{m.emails_exchange_budget({ budget: amount }, o)}</Text>
						)}
						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={`${baseUrl}/gift-exchange`}
							>
								{m.emails_exchange_button({}, o)}
							</Button>
						</Section>
						<Hr className="border-[#eaeaea] my-[26px] mx-0 w-full border border-solid" />
						<Text className="text-[12px] text-[#525252] leading-[20px]">{m.emails_exchange_secret({}, o)}</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

GiftExchangeReadyEmail.PreviewProps = {
	locale: previewLocale,
	exchangeName: 'Family Christmas',
	budget: 50,
	budgetCurrency: 'USD',
	giftDate: '2026-12-25',
} satisfies GiftExchangeReadyEmailProps
