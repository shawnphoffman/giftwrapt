import type { ReactNode } from 'react'
import { Body, Button, Container, Head, Heading, Html, Img, Section, Tailwind, Text } from 'react-email'

import { RichMessage } from '../components/common/rich-message'
import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'
const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface OrphanClaimEmailProps {
	// Null or empty when the account has no name.
	username?: string | null
	locale?: Locale
	itemTitle?: string
	itemImageUrl?: string | null
	recipientName?: string
	listId?: number
	listName?: string
	appTitle?: string
}

export function OrphanClaimEmail({
	username,
	itemTitle,
	itemImageUrl,
	recipientName,
	listId,
	listName,
	appTitle = 'GiftWrapt',
	locale = 'en',
}: OrphanClaimEmailProps) {
	const o = { locale }
	const tags = { strong: (c: ReactNode) => <strong>{c}</strong>, em: (c: ReactNode) => <em>{c}</em> }
	const names = { itemTitle: itemTitle ?? '', listName: listName ?? '' }
	const listUrl = listId ? `${baseUrl}/lists/${listId}` : `${baseUrl}/purchases`
	return (
		<Html lang={locale}>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">{m.emails_orphan_heading({}, o)}</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							{username ? (
								<RichMessage parts={m.emails_hello_name.parts({ name: username }, o)} tags={{ strong: c => <strong>{c}</strong> }} />
							) : (
								<RichMessage parts={m.emails_hello_anon.parts({}, o)} tags={{ strong: c => <strong>{c}</strong> }} />
							)}
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							{recipientName ? (
								<RichMessage parts={m.emails_orphan_body_named.parts({ recipientName, ...names }, o)} tags={tags} />
							) : (
								<RichMessage parts={m.emails_orphan_body_anon.parts(names, o)} tags={tags} />
							)}
						</Text>
						{itemImageUrl && (
							<Section className="mt-4 text-center">
								<Img src={itemImageUrl} width="120" height="120" alt={itemTitle} className="mx-auto my-0 rounded" />
							</Section>
						)}
						<Text className="text-[14px] text-black leading-[24px]">{m.emails_orphan_next({}, o)}</Text>
						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={listUrl}
							>
								{m.emails_orphan_button({}, o)}
							</Button>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

OrphanClaimEmail.PreviewProps = {
	locale: previewLocale,
	username: 'Shawn',
	itemTitle: 'Vintage espresso machine',
	itemImageUrl: 'https://placehold.co/120x120',
	recipientName: 'Madison',
	listId: 45,
	listName: "Madison's Wishlist",
} as OrphanClaimEmailProps

export default OrphanClaimEmail
