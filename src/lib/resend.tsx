import { Resend } from 'resend'

import { type Database, db, type SchemaDatabase } from '@/db'
import type { RevealSummarySection } from '@/emails/reveal-summary-email'
import type { ReminderPickGroup } from '@/lib/cron/reminder-picks'
import { type ResolvedEmailConfig, resolveEmailConfig } from '@/lib/email-config'
import type { Locale } from '@/lib/i18n/locales'
import { recipientLocale, type StoredLocale } from '@/lib/i18n/recipient-locale'
import type { OperatorDigestData } from '@/lib/intelligence/operator-digest'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { m } from '@/paraglide/messages.js'

// Email templates are lazy-loaded inside each send fn below. Statically
// importing them here drags `@react-email/components` (~1.4 MB) and its
// tailwindcss runtime into every server route bundle that transitively
// imports `@/lib/resend` (via `@/lib/orphan-claims`, better-auth, etc.).
// Dynamic imports keep the heavy renderer paid only when an email
// actually fires. Resend's SDK itself dynamically imports
// `@react-email/render`, so removing the static template imports here
// is sufficient to break the chain — see
// `node_modules/resend/dist/index.mjs`'s `await import('@react-email/render')`.

const emailLog = createLogger('email')

// Every send function takes the recipient's stored language (`users.locale`)
// and writes the subject and body in it, falling back to the deployment
// default. A guardian's copy is written in the guardian's language. No
// plain-text part is built here: Resend derives one from the HTML when
// `text` is left out.

// Email is optional: neither env nor DB may supply a key (self-hosted installs
// that don't want transactional email). Build the Resend client per send so a
// runtime config change takes effect without a restart.

export const isEmailConfigured = async (dbx: Database | SchemaDatabase = db): Promise<boolean> => {
	const cfg = await resolveEmailConfig(dbx)
	return cfg.isValid
}

const buildClient = (cfg: ResolvedEmailConfig): Resend | null => {
	if (!cfg.apiKey.value) return null
	return new Resend(cfg.apiKey.value)
}

export const getFromEmail = (cfg: ResolvedEmailConfig): string => {
	const email = cfg.fromEmail.value!
	const name = cfg.fromName.value
	return name ? `${name} <${email}>` : email
}

export const getBccAddress = (cfg: ResolvedEmailConfig): Array<string> | undefined => {
	const bcc = cfg.bccAddress.value
	return bcc ? [bcc] : undefined
}

export const commonEmailProps = (cfg: ResolvedEmailConfig) => {
	const from = getFromEmail(cfg)
	const bcc = getBccAddress(cfg)
	return {
		from,
		...(bcc ? { bcc } : {}),
	}
}

const warnNotConfigured = (action: string) => {
	emailLog.warn({ action }, 'email send skipped: resend api key / from email not configured')
}

type SendResult = { data?: { id?: string } | null; error?: unknown } | null

const logSendResult = (kind: string, recipient: string, res: SendResult) => {
	if (res?.error) {
		emailLog.error({ kind, recipient, err: res.error }, 'email send failed')
	} else {
		emailLog.debug({ kind, recipient, id: res?.data?.id }, 'email sent')
	}
}

export const sendNewCommentEmail = async (
	username: string | null,
	recipient: string,
	commenter: string | null,
	comment: string,
	itemTitle: string,
	listId: number,
	itemId: number,
	opts: { mentioned?: boolean; locale: StoredLocale }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendNewCommentEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(opts.locale, defaultLocale)
	emailLog.info({ kind: 'new-comment', recipient, listId, itemId }, 'sending email')
	const { default: NewCommentEmail } = await import('@/emails/new-comment-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_comment_subject({ appTitle }, { locale }),
		react: (
			<NewCommentEmail
				locale={locale}
				username={username}
				commenter={commenter}
				comment={comment}
				itemTitle={itemTitle}
				listId={listId}
				itemId={itemId}
				appTitle={appTitle}
				mentioned={opts.mentioned}
			/>
		),
	})
	logSendResult('new-comment', recipient, res as SendResult)
	return res
}

export const sendBirthdayEmail = async (name: string | null, recipient: string, storedLocale: StoredLocale) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendBirthdayEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(storedLocale, defaultLocale)
	emailLog.info({ kind: 'birthday', recipient }, 'sending email')
	const { default: BirthdayEmail } = await import('@/emails/happy-birthday-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: name ? m.emails_birthday_subject({ name }, { locale }) : m.emails_birthday_subject_anon({}, { locale }),
		react: <BirthdayEmail name={name} locale={locale} appTitle={appTitle} />,
	})
	logSendResult('birthday', recipient, res as SendResult)
	return res
}

// The reveal email: sent when a list's gifts are revealed, listing exactly
// what that reveal uncovered. One sender for every occasion; the caller
// (`sendRevealEmails`) picks the subject and intro, and says which language
// it wrote them in.
export const sendRevealSummaryEmail = async (
	recipient: string,
	args: { subject: string; intro: string; sections: Array<RevealSummarySection>; locale: Locale }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendRevealSummaryEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	const itemCount = args.sections.reduce((n, section) => n + section.items.length, 0)
	emailLog.info({ kind: 'reveal-summary', recipient, listCount: args.sections.length, itemCount }, 'sending email')
	const { default: RevealSummaryEmail } = await import('@/emails/reveal-summary-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: args.subject,
		react: <RevealSummaryEmail intro={args.intro} sections={args.sections} locale={args.locale} appTitle={appTitle} />,
	})
	logSendResult('reveal-summary', recipient, res as SendResult)
	return res
}

export const sendParentsDayReminderEmail = async (
	recipient: string,
	args: {
		holidayName: string
		// Which of the two days this is, so the name can be written in the
		// reader's language.
		relation: 'mother' | 'father'
		leadDays: number
		people: Array<{ name: string }>
		picks?: ReadonlyArray<ReminderPickGroup>
		locale: StoredLocale
	}
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendParentsDayReminderEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	// English keeps the holiday catalog's name for the deployment's country
	// ("Mothering Sunday"). Other languages use the catalog message until the
	// holiday catalog itself is translated (plan 36h).
	const holidayName =
		locale === 'en'
			? args.holidayName
			: args.relation === 'mother'
				? m.holiday_mothers_day({}, { locale })
				: m.holiday_fathers_day({}, { locale })
	emailLog.info(
		{ kind: 'parental-relations-reminder', recipient, holidayName: args.holidayName, count: args.people.length },
		'sending email'
	)
	const { default: ParentsDayReminderEmail } = await import('@/emails/parents-day-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_countdown({ holidayName, leadDays: args.leadDays }, { locale }),
		react: (
			<ParentsDayReminderEmail
				locale={locale}
				holidayName={holidayName}
				leadDays={args.leadDays}
				people={args.people}
				appTitle={appTitle}
				picks={args.picks}
			/>
		),
	})
	logSendResult('parental-relations-reminder', recipient, res as SendResult)
	return res
}

export const sendPreBirthdayReminderEmail = async (recipient: string, args: { name: string; leadDays: number; locale: StoredLocale }) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPreBirthdayReminderEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	emailLog.info({ kind: 'pre-birthday-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PreBirthdayReminderEmail } = await import('@/emails/pre-birthday-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_pre_birthday_subject({ leadDays: args.leadDays }, { locale }),
		react: <PreBirthdayReminderEmail name={args.name} leadDays={args.leadDays} locale={locale} appTitle={appTitle} />,
	})
	logSendResult('pre-birthday-reminder', recipient, res as SendResult)
	return res
}

export const sendPreChristmasReminderEmail = async (recipient: string, args: { name: string; leadDays: number; locale: StoredLocale }) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPreChristmasReminderEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	emailLog.info({ kind: 'pre-christmas-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PreChristmasReminderEmail } = await import('@/emails/pre-christmas-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_pre_christmas_subject({ leadDays: args.leadDays }, { locale }),
		react: <PreChristmasReminderEmail name={args.name} leadDays={args.leadDays} locale={locale} appTitle={appTitle} />,
	})
	logSendResult('pre-christmas-reminder', recipient, res as SendResult)
	return res
}

export const sendPreCustomHolidayReminderEmail = async (
	recipient: string,
	args: { name: string; holidayName: string; leadDays: number; locale: StoredLocale }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPreCustomHolidayReminderEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	emailLog.info({ kind: 'pre-custom-holiday-reminder', recipient, holidayName: args.holidayName, leadDays: args.leadDays }, 'sending email')
	const { default: PreCustomHolidayReminderEmail } = await import('@/emails/pre-custom-holiday-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_countdown({ holidayName: args.holidayName, leadDays: args.leadDays }, { locale }),
		react: (
			<PreCustomHolidayReminderEmail
				name={args.name}
				holidayName={args.holidayName}
				leadDays={args.leadDays}
				locale={locale}
				appTitle={appTitle}
			/>
		),
	})
	logSendResult('pre-custom-holiday-reminder', recipient, res as SendResult)
	return res
}

export const sendValentinesDayReminderEmail = async (
	recipient: string,
	args: { name: string; partnerName: string; leadDays: number; picks?: ReadonlyArray<ReminderPickGroup>; locale: StoredLocale }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendValentinesDayReminderEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	emailLog.info({ kind: 'valentines-day-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: ValentinesDayReminderEmail } = await import('@/emails/valentines-day-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_valentines_subject({ leadDays: args.leadDays }, { locale }),
		react: (
			<ValentinesDayReminderEmail
				locale={locale}
				name={args.name}
				partnerName={args.partnerName}
				leadDays={args.leadDays}
				appTitle={appTitle}
				picks={args.picks}
			/>
		),
	})
	logSendResult('valentines-day-reminder', recipient, res as SendResult)
	return res
}

export const sendPartnerAnniversaryReminderEmail = async (
	recipient: string,
	args: { name: string; partnerName: string; leadDays: number; picks?: ReadonlyArray<ReminderPickGroup>; locale: StoredLocale }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPartnerAnniversaryReminderEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	emailLog.info({ kind: 'partner-anniversary-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PartnerAnniversaryReminderEmail } = await import('@/emails/partner-anniversary-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_anniversary_subject({ partnerName: args.partnerName, leadDays: args.leadDays }, { locale }),
		react: (
			<PartnerAnniversaryReminderEmail
				locale={locale}
				name={args.name}
				partnerName={args.partnerName}
				leadDays={args.leadDays}
				appTitle={appTitle}
				picks={args.picks}
			/>
		),
	})
	logSendResult('partner-anniversary-reminder', recipient, res as SendResult)
	return res
}

export const sendOrphanClaimEmail = async (
	recipient: string,
	args: {
		username: string | null
		itemTitle: string
		itemImageUrl: string | null
		recipientName: string
		listId: number
		listName: string
		locale: StoredLocale
	}
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendOrphanClaimEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	emailLog.info({ kind: 'orphan-claim', recipient, listId: args.listId }, 'sending email')
	const { default: OrphanClaimEmail } = await import('@/emails/orphan-claim-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_orphan_subject({ recipientName: args.recipientName }, { locale }),
		react: (
			<OrphanClaimEmail
				locale={locale}
				username={args.username}
				itemTitle={args.itemTitle}
				itemImageUrl={args.itemImageUrl}
				recipientName={args.recipientName}
				listId={args.listId}
				listName={args.listName}
				appTitle={appTitle}
			/>
		),
	})
	logSendResult('orphan-claim', recipient, res as SendResult)
	return res
}

// What the day of an orphan claim's cleanup is for its list.
export type OrphanCleanupEvent = 'wishlist' | 'christmas' | 'birthday' | 'holiday'

const cleanupEventLabel = (event: OrphanCleanupEvent | null, locale: Locale): string => {
	if (event === 'wishlist') return m.emails_cleanup_event_wishlist({}, { locale })
	if (event === 'christmas') return m.emails_cleanup_event_christmas({}, { locale })
	if (event === 'birthday') return m.emails_cleanup_event_birthday({}, { locale })
	if (event === 'holiday') return m.emails_cleanup_event_holiday({}, { locale })
	return ''
}

export const sendOrphanClaimCleanupReminderEmail = async (
	recipient: string,
	args: {
		username: string | null
		itemTitle: string
		recipientName: string
		event: OrphanCleanupEvent | null
		listId: number
		listName: string
		locale: StoredLocale
	}
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendOrphanClaimCleanupReminderEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(args.locale, defaultLocale)
	emailLog.info({ kind: 'orphan-claim-cleanup-reminder', recipient, listId: args.listId }, 'sending email')
	const { default: OrphanClaimCleanupReminderEmail } = await import('@/emails/orphan-claim-cleanup-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: m.emails_cleanup_subject({}, { locale }),
		react: (
			<OrphanClaimCleanupReminderEmail
				locale={locale}
				username={args.username}
				itemTitle={args.itemTitle}
				recipientName={args.recipientName}
				eventLabel={cleanupEventLabel(args.event, locale)}
				listId={args.listId}
				listName={args.listName}
				appTitle={appTitle}
			/>
		),
	})
	logSendResult('orphan-claim-cleanup-reminder', recipient, res as SendResult)
	return res
}

// Sends the better-auth password-reset link. Wired into
// `emailAndPassword.sendResetPassword` in src/lib/auth.ts. Returns
// `null` (and logs a warning) if email isn't configured so the
// underlying auth call doesn't appear to succeed when nothing was
// actually sent. Callers in the API surface check `isEmailConfigured()`
// up front to decide whether to even offer the reset path.
export const sendPasswordResetEmail = async (params: {
	name?: string | null
	recipient: string
	resetUrl: string
	expiresInMinutes: number
	locale: StoredLocale
}) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPasswordResetEmail')
		return null
	}
	const { appTitle, defaultLocale } = await getAppSettings(db)
	const locale = recipientLocale(params.locale, defaultLocale)
	emailLog.info({ kind: 'password-reset', recipient: params.recipient }, 'sending email')
	const { default: PasswordResetEmail } = await import('@/emails/password-reset-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: params.recipient,
		subject: m.emails_reset_subject({ appTitle }, { locale }),
		react: (
			<PasswordResetEmail
				name={params.name}
				resetUrl={params.resetUrl}
				expiresInMinutes={params.expiresInMinutes}
				locale={locale}
				appTitle={appTitle}
			/>
		),
	})
	logSendResult('password-reset', params.recipient, res as SendResult)
	return res
}

// Operator Digest. Sends one email per recipient with that recipient in
// `to`, so admins' addresses aren't exposed to each other. Never addressed
// to the From address (often a send-only address with no mailbox, so it
// bounces), and the deployment BCC is not added. Throws when every send
// fails so the cron caller logs it and doesn't stamp last-sent. The caller
// passes the subject (computed from the digest status) to avoid a static
// import cycle with the digest module.
export const sendOperatorDigestEmail = async (recipients: Array<string>, data: OperatorDigestData, subject: string) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendOperatorDigestEmail')
		return null
	}
	if (recipients.length === 0) return null
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'intelligence-operator-digest', recipientCount: recipients.length }, 'sending email')
	const { default: IntelligenceOperatorDigestEmail } = await import('@/emails/intelligence-operator-digest')
	const results: Array<SendResult> = []
	for (const to of recipients) {
		const res = await client.emails.send({
			from: getFromEmail(cfg),
			to,
			subject,
			react: <IntelligenceOperatorDigestEmail data={data} appTitle={appTitle} />,
		})
		logSendResult('intelligence-operator-digest', to, res as SendResult)
		results.push(res as SendResult)
	}
	if (results.every(r => r?.error)) {
		const err = results[0]?.error
		const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Resend rejected the request.'
		throw new Error(msg)
	}
	return results
}

export const TEST_EMAIL_KINDS = [
	{ value: 'test', label: 'Generic Test Email' },
	{ value: 'new-comment', label: 'New Comment Notification' },
	{ value: 'birthday', label: 'Happy Birthday' },
	{ value: 'post-birthday', label: 'Gift Reveal Summary (Birthday)' },
	{ value: 'pre-birthday-reminder', label: 'Pre-birthday Reminder' },
	{ value: 'pre-christmas-reminder', label: 'Pre-Christmas Reminder' },
	{ value: 'pre-custom-holiday-reminder', label: 'Pre-custom-holiday Reminder' },
	{ value: 'parental-relations-reminder', label: "Mother's/Father's Day Reminder" },
	{ value: 'valentines-day-reminder', label: "Valentine's Day Reminder" },
	{ value: 'partner-anniversary-reminder', label: 'Partner Anniversary Reminder' },
	{ value: 'orphan-claim', label: 'Orphan Claim Alert' },
	{ value: 'orphan-claim-cleanup-reminder', label: 'Orphan Claim Cleanup Reminder' },
	{ value: 'post-holiday', label: 'Gift Reveal Summary (Holiday)' },
	{ value: 'password-reset', label: 'Password Reset' },
	{ value: 'intelligence-operator-digest', label: 'Intelligence Operator Digest' },
] as const

export type TestEmailKind = (typeof TEST_EMAIL_KINDS)[number]['value']

const buildTestEmailPayload = async (
	kind: TestEmailKind,
	appTitle: string,
	locale: Locale
): Promise<{ subject: string; react: React.ReactElement }> => {
	const o = { locale }
	switch (kind) {
		case 'test': {
			const { default: TestEmail } = await import('@/emails/test-email')
			return { subject: m.emails_test_subject({}, o), react: <TestEmail locale={locale} appTitle={appTitle} /> }
		}
		case 'new-comment': {
			const { default: NewCommentEmail } = await import('@/emails/new-comment-email')
			return {
				subject: m.emails_comment_subject({ appTitle }, o),
				react: (
					<NewCommentEmail
						locale={locale}
						username="Shawn"
						commenter="Madison"
						comment="This is a test comment"
						itemTitle="Test Item"
						listId={45}
						itemId={1199}
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'birthday': {
			const { default: BirthdayEmail } = await import('@/emails/happy-birthday-email')
			return {
				subject: m.emails_birthday_subject({ name: 'Shawn' }, o),
				react: <BirthdayEmail name="Shawn" locale={locale} appTitle={appTitle} />,
			}
		}
		case 'post-birthday': {
			const { default: RevealSummaryEmail } = await import('@/emails/reveal-summary-email')
			return {
				subject: m.emails_reveal_subject_generic({}, o),
				react: (
					<RevealSummaryEmail
						locale={locale}
						intro={m.emails_reveal_intro_birthday_self({}, o)}
						sections={[
							{
								listName: 'Birthday Wishes',
								items: [
									{ title: 'Vintage espresso machine', image_url: 'https://placehold.co/600x400', gifters: 'John & Jane' },
									{ title: 'Cashmere scarf', image_url: 'https://placehold.co/100x200', gifters: 'John' },
									{ title: 'Homemade jam', image_url: null, gifters: 'Jane, Alex & Priya', offList: true },
								],
							},
						]}
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'pre-birthday-reminder': {
			const { default: PreBirthdayReminderEmail } = await import('@/emails/pre-birthday-reminder-email')
			return {
				subject: m.emails_pre_birthday_subject({ leadDays: 30 }, o),
				react: <PreBirthdayReminderEmail name="Alex" leadDays={30} locale={locale} appTitle={appTitle} />,
			}
		}
		case 'pre-christmas-reminder': {
			const { default: PreChristmasReminderEmail } = await import('@/emails/pre-christmas-reminder-email')
			return {
				subject: m.emails_pre_christmas_subject({ leadDays: 30 }, o),
				react: <PreChristmasReminderEmail name="Alex" leadDays={30} locale={locale} appTitle={appTitle} />,
			}
		}
		case 'pre-custom-holiday-reminder': {
			const { default: PreCustomHolidayReminderEmail } = await import('@/emails/pre-custom-holiday-reminder-email')
			return {
				subject: m.emails_countdown({ holidayName: 'Easter', leadDays: 30 }, o),
				react: <PreCustomHolidayReminderEmail name="Alex" holidayName="Easter" leadDays={30} locale={locale} appTitle={appTitle} />,
			}
		}
		case 'parental-relations-reminder': {
			const { default: ParentsDayReminderEmail } = await import('@/emails/parents-day-reminder-email')
			const holidayName = m.holiday_mothers_day({}, o)
			return {
				subject: m.emails_countdown({ holidayName, leadDays: 7 }, o),
				react: (
					<ParentsDayReminderEmail
						locale={locale}
						holidayName={holidayName}
						leadDays={7}
						people={[{ name: 'Mom' }, { name: 'Sandra' }]}
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'valentines-day-reminder': {
			const { default: ValentinesDayReminderEmail } = await import('@/emails/valentines-day-reminder-email')
			return {
				subject: m.emails_valentines_subject({ leadDays: 14 }, o),
				react: <ValentinesDayReminderEmail name="Alex" partnerName="Casey" leadDays={14} locale={locale} appTitle={appTitle} />,
			}
		}
		case 'partner-anniversary-reminder': {
			const { default: PartnerAnniversaryReminderEmail } = await import('@/emails/partner-anniversary-reminder-email')
			return {
				subject: m.emails_anniversary_subject({ partnerName: 'Casey', leadDays: 7 }, o),
				react: <PartnerAnniversaryReminderEmail name="Alex" partnerName="Casey" leadDays={7} locale={locale} appTitle={appTitle} />,
			}
		}
		case 'orphan-claim': {
			const { default: OrphanClaimEmail } = await import('@/emails/orphan-claim-email')
			return {
				subject: m.emails_orphan_subject({ recipientName: 'Madison' }, o),
				react: (
					<OrphanClaimEmail
						locale={locale}
						username="Shawn"
						itemTitle="Vintage espresso machine"
						itemImageUrl="https://placehold.co/120x120"
						recipientName="Madison"
						listId={45}
						listName="Madison's Wishlist"
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'orphan-claim-cleanup-reminder': {
			const { default: OrphanClaimCleanupReminderEmail } = await import('@/emails/orphan-claim-cleanup-reminder-email')
			return {
				subject: m.emails_cleanup_subject({}, o),
				react: (
					<OrphanClaimCleanupReminderEmail
						locale={locale}
						username="Shawn"
						itemTitle="Vintage espresso machine"
						recipientName="Madison"
						eventLabel={cleanupEventLabel('birthday', locale)}
						listId={45}
						listName="Madison's Wishlist"
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'post-holiday': {
			const { default: RevealSummaryEmail } = await import('@/emails/reveal-summary-email')
			return {
				subject: m.emails_reveal_subject_occasion_self({ occasion: m.holiday_mothers_day({}, o) }, o),
				react: (
					<RevealSummaryEmail
						locale={locale}
						intro={m.emails_reveal_intro_occasion_self({ occasion: m.holiday_mothers_day({}, o) }, o)}
						sections={[
							{
								listName: "Mother's Day Wishes",
								items: [
									{ title: 'Ceramic planter', image_url: 'https://placehold.co/600x400', gifters: 'Alex' },
									{ title: 'Flowers', image_url: null, gifters: 'Priya', offList: true },
								],
							},
						]}
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'password-reset': {
			const { default: PasswordResetEmail } = await import('@/emails/password-reset-email')
			return {
				subject: m.emails_reset_subject({ appTitle }, o),
				react: (
					<PasswordResetEmail
						locale={locale}
						name="Sam"
						resetUrl="https://giftwrapt.app/reset-password?token=preview-token"
						expiresInMinutes={60}
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'intelligence-operator-digest': {
			// "Send test now": build the REAL digest over a trailing
			// refresh-interval window and send to the test recipient. Dynamic
			// import breaks the static cycle with @/lib/resend.
			const [{ default: IntelligenceOperatorDigestEmail }, { buildOperatorDigest, digestWindow, operatorDigestSubject }] =
				await Promise.all([import('@/emails/intelligence-operator-digest'), import('@/lib/intelligence/operator-digest')])
			const settings = await getAppSettings(db)
			const now = new Date()
			const data = await buildOperatorDigest(digestWindow(null, settings.intelligenceRefreshIntervalDays, now))
			return { subject: operatorDigestSubject(data), react: <IntelligenceOperatorDigestEmail data={data} appTitle={appTitle} /> }
		}
	}
}

export const sendTestEmail = async (kind: TestEmailKind = 'test', recipient?: string, locale: Locale = 'en') => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client?.emails || !cfg.apiKey.value || !cfg.fromEmail.value) {
		throw new Error('Email is not configured. Set a Resend API key and From Email above.')
	}

	// Never fall back to the From address: it is often send-only, so mail to it bounces.
	const to = recipient?.trim() || cfg.bccAddress.value
	if (!to) {
		throw new Error('No recipient available. Enter a test recipient address.')
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: `test:${kind}`, recipient: to }, 'sending email')
	const { subject, react } = await buildTestEmailPayload(kind, appTitle, locale)
	const res = await client.emails.send({
		from: getFromEmail(cfg),
		to,
		subject,
		react,
	})
	logSendResult(`test:${kind}`, to, res as SendResult)
	if (res.error) {
		const msg = 'message' in res.error ? String(res.error.message) : 'Resend rejected the request.'
		throw new Error(msg)
	}
	return res
}
