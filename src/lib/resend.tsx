import { Resend } from 'resend'

import { type Database, db, type SchemaDatabase } from '@/db'
import { type ResolvedEmailConfig, resolveEmailConfig } from '@/lib/email-config'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

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
	username: string,
	recipient: string,
	commenter: string,
	comment: string,
	itemTitle: string,
	listId: number,
	itemId: number
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendNewCommentEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'new-comment', recipient, listId, itemId }, 'sending email')
	const { default: NewCommentEmail } = await import('@/emails/new-comment-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `New Comment on ${appTitle}`,
		react: (
			<NewCommentEmail
				username={username}
				commenter={commenter}
				comment={comment}
				itemTitle={itemTitle}
				listId={listId}
				itemId={itemId}
				appTitle={appTitle}
			/>
		),
	})
	logSendResult('new-comment', recipient, res as SendResult)
	return res
}

export const sendBirthdayEmail = async (name: string, recipient: string) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendBirthdayEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'birthday', recipient }, 'sending email')
	const { default: BirthdayEmail } = await import('@/emails/happy-birthday-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `🎉 Happy Birthday, ${name}!`,
		react: <BirthdayEmail name={name} appTitle={appTitle} />,
	})
	logSendResult('birthday', recipient, res as SendResult)
	return res
}

export const sendPostBirthdayEmail = async (recipient: string, items: Array<{ title: string; image_url: string; gifters: string }>) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPostBirthdayEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'post-birthday', recipient, itemCount: items.length }, 'sending email')
	const { default: PostBirthdayEmail } = await import('@/emails/post-birthday-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: 'A look back at your gifts',
		react: <PostBirthdayEmail items={items} appTitle={appTitle} />,
	})
	logSendResult('post-birthday', recipient, res as SendResult)
	return res
}

export const sendParentsDayReminderEmail = async (
	recipient: string,
	args: { holidayName: string; leadDays: number; people: Array<{ name: string }> }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendParentsDayReminderEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info(
		{ kind: 'parental-relations-reminder', recipient, holidayName: args.holidayName, count: args.people.length },
		'sending email'
	)
	const { default: ParentsDayReminderEmail } = await import('@/emails/parents-day-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `${args.holidayName} is in ${args.leadDays} days`,
		react: <ParentsDayReminderEmail holidayName={args.holidayName} leadDays={args.leadDays} people={args.people} appTitle={appTitle} />,
	})
	logSendResult('parental-relations-reminder', recipient, res as SendResult)
	return res
}

export const sendPreBirthdayReminderEmail = async (recipient: string, args: { name: string; leadDays: number }) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPreBirthdayReminderEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'pre-birthday-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PreBirthdayReminderEmail } = await import('@/emails/pre-birthday-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Your birthday is in ${args.leadDays} days`,
		react: <PreBirthdayReminderEmail name={args.name} leadDays={args.leadDays} appTitle={appTitle} />,
	})
	logSendResult('pre-birthday-reminder', recipient, res as SendResult)
	return res
}

export const sendPreChristmasReminderEmail = async (recipient: string, args: { name: string; leadDays: number }) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPreChristmasReminderEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'pre-christmas-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PreChristmasReminderEmail } = await import('@/emails/pre-christmas-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Christmas is in ${args.leadDays} days`,
		react: <PreChristmasReminderEmail name={args.name} leadDays={args.leadDays} appTitle={appTitle} />,
	})
	logSendResult('pre-christmas-reminder', recipient, res as SendResult)
	return res
}

export const sendPreCustomHolidayReminderEmail = async (
	recipient: string,
	args: { name: string; holidayName: string; leadDays: number }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPreCustomHolidayReminderEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'pre-custom-holiday-reminder', recipient, holidayName: args.holidayName, leadDays: args.leadDays }, 'sending email')
	const { default: PreCustomHolidayReminderEmail } = await import('@/emails/pre-custom-holiday-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `${args.holidayName} is in ${args.leadDays} days`,
		react: <PreCustomHolidayReminderEmail name={args.name} holidayName={args.holidayName} leadDays={args.leadDays} appTitle={appTitle} />,
	})
	logSendResult('pre-custom-holiday-reminder', recipient, res as SendResult)
	return res
}

export const sendValentinesDayReminderEmail = async (recipient: string, args: { name: string; partnerName: string; leadDays: number }) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendValentinesDayReminderEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'valentines-day-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: ValentinesDayReminderEmail } = await import('@/emails/valentines-day-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Valentine's Day is in ${args.leadDays} days`,
		react: <ValentinesDayReminderEmail name={args.name} partnerName={args.partnerName} leadDays={args.leadDays} appTitle={appTitle} />,
	})
	logSendResult('valentines-day-reminder', recipient, res as SendResult)
	return res
}

export const sendPartnerAnniversaryReminderEmail = async (
	recipient: string,
	args: { name: string; partnerName: string; leadDays: number }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPartnerAnniversaryReminderEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'partner-anniversary-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PartnerAnniversaryReminderEmail } = await import('@/emails/partner-anniversary-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Your anniversary with ${args.partnerName} is in ${args.leadDays} days`,
		react: <PartnerAnniversaryReminderEmail name={args.name} partnerName={args.partnerName} leadDays={args.leadDays} appTitle={appTitle} />,
	})
	logSendResult('partner-anniversary-reminder', recipient, res as SendResult)
	return res
}

export const sendOrphanClaimEmail = async (
	recipient: string,
	args: {
		username: string
		itemTitle: string
		itemImageUrl: string | null
		recipientName: string
		listId: number
		listName: string
	}
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendOrphanClaimEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'orphan-claim', recipient, listId: args.listId }, 'sending email')
	const { default: OrphanClaimEmail } = await import('@/emails/orphan-claim-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `An item you claimed for ${args.recipientName} was removed`,
		react: (
			<OrphanClaimEmail
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

export const sendOrphanClaimCleanupReminderEmail = async (
	recipient: string,
	args: { username: string; itemTitle: string; recipientName: string; eventLabel: string; listId: number; listName: string }
) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendOrphanClaimCleanupReminderEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'orphan-claim-cleanup-reminder', recipient, listId: args.listId }, 'sending email')
	const { default: OrphanClaimCleanupReminderEmail } = await import('@/emails/orphan-claim-cleanup-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Cleaning up an unanswered claim tomorrow`,
		react: (
			<OrphanClaimCleanupReminderEmail
				username={args.username}
				itemTitle={args.itemTitle}
				recipientName={args.recipientName}
				eventLabel={args.eventLabel}
				listId={args.listId}
				listName={args.listName}
				appTitle={appTitle}
			/>
		),
	})
	logSendResult('orphan-claim-cleanup-reminder', recipient, res as SendResult)
	return res
}

export const sendPostHolidayEmail = async (recipient: string, args: { holidayName: string; listName: string }) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPostHolidayEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'post-holiday', recipient, holidayName: args.holidayName }, 'sending email')
	const { default: PostHolidayEmail } = await import('@/emails/post-holiday-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `A look back at your ${args.holidayName} list`,
		react: <PostHolidayEmail holidayName={args.holidayName} listName={args.listName} appTitle={appTitle} />,
	})
	logSendResult('post-holiday', recipient, res as SendResult)
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
}) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		warnNotConfigured('sendPasswordResetEmail')
		return null
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: 'password-reset', recipient: params.recipient }, 'sending email')
	const { default: PasswordResetEmail } = await import('@/emails/password-reset-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: params.recipient,
		subject: `Reset your ${appTitle} password`,
		react: (
			<PasswordResetEmail name={params.name} resetUrl={params.resetUrl} expiresInMinutes={params.expiresInMinutes} appTitle={appTitle} />
		),
	})
	logSendResult('password-reset', params.recipient, res as SendResult)
	return res
}

export const TEST_EMAIL_KINDS = [
	{ value: 'test', label: 'Generic test email' },
	{ value: 'new-comment', label: 'New comment notification' },
	{ value: 'birthday', label: 'Happy birthday' },
	{ value: 'post-birthday', label: 'Post-birthday summary' },
	{ value: 'pre-birthday-reminder', label: 'Pre-birthday reminder' },
	{ value: 'pre-christmas-reminder', label: 'Pre-Christmas reminder' },
	{ value: 'pre-custom-holiday-reminder', label: 'Pre-custom-holiday reminder' },
	{ value: 'parental-relations-reminder', label: "Mother's/Father's Day reminder" },
	{ value: 'valentines-day-reminder', label: "Valentine's Day reminder" },
	{ value: 'partner-anniversary-reminder', label: 'Partner anniversary reminder' },
	{ value: 'orphan-claim', label: 'Orphan claim alert' },
	{ value: 'orphan-claim-cleanup-reminder', label: 'Orphan claim cleanup reminder' },
	{ value: 'post-holiday', label: 'Post-holiday summary' },
	{ value: 'password-reset', label: 'Password reset' },
] as const

export type TestEmailKind = (typeof TEST_EMAIL_KINDS)[number]['value']

const buildTestEmailPayload = async (kind: TestEmailKind, appTitle: string): Promise<{ subject: string; react: React.ReactElement }> => {
	switch (kind) {
		case 'test': {
			const { default: TestEmail } = await import('@/emails/test-email')
			return { subject: 'Test Email', react: <TestEmail appTitle={appTitle} /> }
		}
		case 'new-comment': {
			const { default: NewCommentEmail } = await import('@/emails/new-comment-email')
			return {
				subject: `New Comment on ${appTitle}`,
				react: (
					<NewCommentEmail
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
			return { subject: '🎉 Happy Birthday, Shawn!', react: <BirthdayEmail name="Shawn" appTitle={appTitle} /> }
		}
		case 'post-birthday': {
			const { default: PostBirthdayEmail } = await import('@/emails/post-birthday-email')
			return {
				subject: 'A look back at your gifts',
				react: (
					<PostBirthdayEmail
						items={[
							{ title: 'Vintage espresso machine', image_url: 'https://placehold.co/600x400', gifters: 'John & Jane' },
							{ title: 'Cashmere scarf', image_url: 'https://placehold.co/100x200', gifters: 'John' },
							{ title: 'Leather-bound notebook', image_url: 'https://placehold.co/400x200', gifters: 'Jane, Alex & Priya' },
						]}
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'pre-birthday-reminder': {
			const { default: PreBirthdayReminderEmail } = await import('@/emails/pre-birthday-reminder-email')
			return {
				subject: 'Your birthday is in 30 days',
				react: <PreBirthdayReminderEmail name="Alex" leadDays={30} appTitle={appTitle} />,
			}
		}
		case 'pre-christmas-reminder': {
			const { default: PreChristmasReminderEmail } = await import('@/emails/pre-christmas-reminder-email')
			return {
				subject: 'Christmas is in 30 days',
				react: <PreChristmasReminderEmail name="Alex" leadDays={30} appTitle={appTitle} />,
			}
		}
		case 'pre-custom-holiday-reminder': {
			const { default: PreCustomHolidayReminderEmail } = await import('@/emails/pre-custom-holiday-reminder-email')
			return {
				subject: 'Easter is in 30 days',
				react: <PreCustomHolidayReminderEmail name="Alex" holidayName="Easter" leadDays={30} appTitle={appTitle} />,
			}
		}
		case 'parental-relations-reminder': {
			const { default: ParentsDayReminderEmail } = await import('@/emails/parents-day-reminder-email')
			return {
				subject: "Mother's Day is in 7 days",
				react: (
					<ParentsDayReminderEmail
						holidayName="Mother's Day"
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
				subject: "Valentine's Day is in 14 days",
				react: <ValentinesDayReminderEmail name="Alex" partnerName="Casey" leadDays={14} appTitle={appTitle} />,
			}
		}
		case 'partner-anniversary-reminder': {
			const { default: PartnerAnniversaryReminderEmail } = await import('@/emails/partner-anniversary-reminder-email')
			return {
				subject: 'Your anniversary with Casey is in 7 days',
				react: <PartnerAnniversaryReminderEmail name="Alex" partnerName="Casey" leadDays={7} appTitle={appTitle} />,
			}
		}
		case 'orphan-claim': {
			const { default: OrphanClaimEmail } = await import('@/emails/orphan-claim-email')
			return {
				subject: 'An item you claimed for Madison was removed',
				react: (
					<OrphanClaimEmail
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
				subject: 'Cleaning up an unanswered claim tomorrow',
				react: (
					<OrphanClaimCleanupReminderEmail
						username="Shawn"
						itemTitle="Vintage espresso machine"
						recipientName="Madison"
						eventLabel="Madison's birthday"
						listId={45}
						listName="Madison's Wishlist"
						appTitle={appTitle}
					/>
				),
			}
		}
		case 'post-holiday': {
			const { default: PostHolidayEmail } = await import('@/emails/post-holiday-email')
			return {
				subject: "A look back at your Mother's Day list",
				react: <PostHolidayEmail holidayName="Mother's Day" listName="Mother's Day Wishes" appTitle={appTitle} />,
			}
		}
		case 'password-reset': {
			const { default: PasswordResetEmail } = await import('@/emails/password-reset-email')
			return {
				subject: `Reset your ${appTitle} password`,
				react: (
					<PasswordResetEmail
						name="Sam"
						resetUrl="https://giftwrapt.app/reset-password?token=preview-token"
						expiresInMinutes={60}
						appTitle={appTitle}
					/>
				),
			}
		}
	}
}

export const sendTestEmail = async (kind: TestEmailKind = 'test', recipient?: string) => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client?.emails || !cfg.apiKey.value || !cfg.fromEmail.value) {
		throw new Error('Email is not configured. Set a Resend API key and From Email above.')
	}

	const to = recipient?.trim() || cfg.bccAddress.value || cfg.fromEmail.value
	if (!to) {
		throw new Error('No recipient available. Enter a test recipient address.')
	}
	const { appTitle } = await getAppSettings(db)
	emailLog.info({ kind: `test:${kind}`, recipient: to }, 'sending email')
	const { subject, react } = await buildTestEmailPayload(kind, appTitle)
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
