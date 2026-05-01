import { Resend } from 'resend'

import { db } from '@/db'
import BirthdayEmail from '@/emails/happy-birthday-email'
import NewCommentEmail from '@/emails/new-comment-email'
import PasswordResetEmail from '@/emails/password-reset-email'
import PostBirthdayEmail from '@/emails/post-birthday-email'
import TestEmail from '@/emails/test-email'
import { type ResolvedEmailConfig, resolveEmailConfig } from '@/lib/email-config'
import { createLogger } from '@/lib/logger'

const emailLog = createLogger('email')

// Email is optional: neither env nor DB may supply a key (self-hosted installs
// that don't want transactional email). Build the Resend client per send so a
// runtime config change takes effect without a restart.

export const isEmailConfigured = async (): Promise<boolean> => {
	const cfg = await resolveEmailConfig(db)
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
	const res = await client.emails.send({
		...commonEmailProps(cfg),
		to: recipient,
		subject: 'A look back at your gifts',
		react: <PostBirthdayEmail items={items} />,
	})
	logSendResult('post-birthday', recipient, res as SendResult)
	return res
}

// Sends the better-auth password-reset link. Wired into
// `emailAndPassword.sendResetPassword` in src/lib/auth.ts. Returns
// `null` (and logs a warning) if email isn't configured so the
// underlying auth call doesn't appear to succeed when nothing was
// actually sent — callers in the API surface check `isEmailConfigured()`
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
	const res = await client.emails.send({
		from: getFromEmail(cfg),
		to,
		subject: 'Test Email',
		react: <TestEmail />,
	})
	logSendResult('test', to, res as SendResult)
	return res
}
