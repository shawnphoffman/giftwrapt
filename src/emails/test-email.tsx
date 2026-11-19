import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Tailwind, Text } from 'react-email'

import { RichMessage } from '../components/common/rich-message'
import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'
const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'

interface TestEmailProps {
	locale?: Locale
	appTitle?: string
}

export function TestEmail({ locale = 'en', appTitle = 'GiftWrapt' }: TestEmailProps = {}) {
	const o = { locale }
	return (
		<Html lang={locale}>
			<Head />
			<Preview>{m.emails_test_subject({}, o)}</Preview>
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-black dark`">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded border bg-white border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img src={`${baseUrl}/images/email/base-icon.webp`} width="80" height="80" alt={appTitle} className="mx-auto my-0" />
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-bold text-[24px] text-black">
							{m.emails_comment_subject({ appTitle }, o)}
						</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							<RichMessage parts={m.emails_test_hello.parts({}, o)} tags={{ strong: c => <strong>{c}</strong> }} />
						</Text>

						<Section className="mt-6 text-center">
							<Button
								className="rounded bg-[rgb(206,28,28)] px-6 py-3 text-center font-semibold text-base text-white no-underline"
								href={baseUrl}
							>
								{m.emails_test_button({}, o)}
							</Button>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

TestEmail.PreviewProps = { locale: previewLocale } as TestEmailProps

export default TestEmail
