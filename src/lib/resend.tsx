import { Resend } from 'resend'

import { type Database, db, type SchemaDatabase } from '@/db'
import { type ResolvedEmailConfig, resolveEmailConfig } from '@/lib/email-config'
import { createLogger } from '@/lib/logger'

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
	emailLog.info({ kind: 'new-comment', recipient, listId, itemId }, 'sending email')
	const { default: NewCommentEmail } = await import('@/emails/new-comment-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: 'New Comment on GiftWrapt',
		react: (
			<NewCommentEmail username={username} commenter={commenter} comment={comment} itemTitle={itemTitle} listId={listId} itemId={itemId} />
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
	emailLog.info({ kind: 'birthday', recipient }, 'sending email')
	const { default: BirthdayEmail } = await import('@/emails/happy-birthday-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `🎉 Happy Birthday, ${name}!`,
		react: <BirthdayEmail name={name} />,
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
	emailLog.info({ kind: 'post-birthday', recipient, itemCount: items.length }, 'sending email')
	const { default: PostBirthdayEmail } = await import('@/emails/post-birthday-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: 'A look back at your gifts',
		react: <PostBirthdayEmail items={items} />,
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
	emailLog.info(
		{ kind: 'parental-relations-reminder', recipient, holidayName: args.holidayName, count: args.people.length },
		'sending email'
	)
	const { default: ParentsDayReminderEmail } = await import('@/emails/parents-day-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `${args.holidayName} is in ${args.leadDays} days`,
		react: <ParentsDayReminderEmail holidayName={args.holidayName} leadDays={args.leadDays} people={args.people} />,
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
	emailLog.info({ kind: 'pre-birthday-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PreBirthdayReminderEmail } = await import('@/emails/pre-birthday-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Your birthday is in ${args.leadDays} days`,
		react: <PreBirthdayReminderEmail name={args.name} leadDays={args.leadDays} />,
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
	emailLog.info({ kind: 'pre-christmas-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PreChristmasReminderEmail } = await import('@/emails/pre-christmas-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Christmas is in ${args.leadDays} days`,
		react: <PreChristmasReminderEmail name={args.name} leadDays={args.leadDays} />,
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
	emailLog.info({ kind: 'pre-custom-holiday-reminder', recipient, holidayName: args.holidayName, leadDays: args.leadDays }, 'sending email')
	const { default: PreCustomHolidayReminderEmail } = await import('@/emails/pre-custom-holiday-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `${args.holidayName} is in ${args.leadDays} days`,
		react: <PreCustomHolidayReminderEmail name={args.name} holidayName={args.holidayName} leadDays={args.leadDays} />,
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
	emailLog.info({ kind: 'valentines-day-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: ValentinesDayReminderEmail } = await import('@/emails/valentines-day-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Valentine's Day is in ${args.leadDays} days`,
		react: <ValentinesDayReminderEmail name={args.name} partnerName={args.partnerName} leadDays={args.leadDays} />,
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
	emailLog.info({ kind: 'partner-anniversary-reminder', recipient, leadDays: args.leadDays }, 'sending email')
	const { default: PartnerAnniversaryReminderEmail } = await import('@/emails/partner-anniversary-reminder-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `Your anniversary with ${args.partnerName} is in ${args.leadDays} days`,
		react: <PartnerAnniversaryReminderEmail name={args.name} partnerName={args.partnerName} leadDays={args.leadDays} />,
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
	emailLog.info({ kind: 'post-holiday', recipient, holidayName: args.holidayName }, 'sending email')
	const { default: PostHolidayEmail } = await import('@/emails/post-holiday-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: `A look back at your ${args.holidayName} list`,
		react: <PostHolidayEmail holidayName={args.holidayName} listName={args.listName} />,
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
	emailLog.info({ kind: 'password-reset', recipient: params.recipient }, 'sending email')
	const { default: PasswordResetEmail } = await import('@/emails/password-reset-email')
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: params.recipient,
		subject: 'Reset your GiftWrapt password',
		react: <PasswordResetEmail name={params.name} resetUrl={params.resetUrl} expiresInMinutes={params.expiresInMinutes} />,
	})
	logSendResult('password-reset', params.recipient, res as SendResult)
	return res
}

export const sendTestEmail = async () => {
	const cfg = await resolveEmailConfig(db)
	const client = buildClient(cfg)
	if (!client || !cfg.isValid) {
		throw new Error('Email is not configured. Set a Resend API key and from address.')
	}

	const to = cfg.bccAddress.value || cfg.fromEmail.value!
	emailLog.info({ kind: 'test', recipient: to }, 'sending email')
	const { default: TestEmail } = await import('@/emails/test-email')
	const res = await client.emails.send({
		from: getFromEmail(cfg),
		to,
		subject: 'Test Email',
		react: <TestEmail />,
	})
	logSendResult('test', to, res as SendResult)
	if (res.error) {
		const msg = 'message' in res.error ? String(res.error.message) : 'Resend rejected the request.'
		throw new Error(msg)
	}
	return res
}
