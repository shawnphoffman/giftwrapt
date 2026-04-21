import { Resend } from 'resend'

import BirthdayEmail from '@/emails/happy-birthday-email'
import NewCommentEmail from '@/emails/new-comment-email'
import PostBirthdayEmail from '@/emails/post-birthday-email'
import TestEmail from '@/emails/test-email'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'

const emailLog = createLogger('email')

// Email is optional: RESEND_API_KEY may be unset (self-hosted installs that
// don't want transactional email). Instantiate lazily so module import never
// crashes, and so each send can cleanly no-op when the key is missing.
let cachedClient: Resend | null | undefined

export const isEmailConfigured = (): boolean => {
	return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL)
}

const getResendClient = (): Resend | null => {
	if (cachedClient !== undefined) return cachedClient
	if (!env.RESEND_API_KEY) {
		cachedClient = null
		return null
	}
	cachedClient = new Resend(env.RESEND_API_KEY)
	return cachedClient
}

export const getFromEmail = (): string => {
	const email = env.RESEND_FROM_EMAIL!
	const name = env.RESEND_FROM_NAME
	return name ? `${name} <${email}>` : email
}

export const getBccAddress = (): Array<string> | undefined => {
	const bcc = env.RESEND_BCC_ADDRESS
	return bcc ? [bcc] : undefined
}

export const commonEmailProps = () => {
	const from = getFromEmail()
	const bcc = getBccAddress()
	return {
		from,
		...(bcc ? { bcc } : {}),
	}
}

const warnNotConfigured = (action: string) => {
	emailLog.warn({ action }, 'email send skipped: RESEND_API_KEY / RESEND_FROM_EMAIL not configured')
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
	const client = getResendClient()
	if (!client || !env.RESEND_FROM_EMAIL) {
		warnNotConfigured('sendNewCommentEmail')
		return null
	}
	emailLog.info({ kind: 'new-comment', recipient, listId, itemId }, 'sending email')
	const res = await client.emails.send({
		...commonEmailProps(),
		to: recipient,
		subject: 'New Comment on Wish Lists',
		react: (
			<NewCommentEmail username={username} commenter={commenter} comment={comment} itemTitle={itemTitle} listId={listId} itemId={itemId} />
		),
	})
	logSendResult('new-comment', recipient, res as SendResult)
	return res
}

export const sendBirthdayEmail = async (name: string, recipient: string) => {
	const client = getResendClient()
	if (!client || !env.RESEND_FROM_EMAIL) {
		warnNotConfigured('sendBirthdayEmail')
		return null
	}
	emailLog.info({ kind: 'birthday', recipient }, 'sending email')
	const res = await client.emails.send({
		...commonEmailProps(),
		to: recipient,
		subject: `🎉 Happy Birthday, ${name}!`,
		react: <BirthdayEmail name={name} />,
	})
	logSendResult('birthday', recipient, res as SendResult)
	return res
}

export const sendPostBirthdayEmail = async (recipient: string, items: Array<{ title: string; image_url: string; gifters: string }>) => {
	const client = getResendClient()
	if (!client || !env.RESEND_FROM_EMAIL) {
		warnNotConfigured('sendPostBirthdayEmail')
		return null
	}
	emailLog.info({ kind: 'post-birthday', recipient, itemCount: items.length }, 'sending email')
	const res = await client.emails.send({
		...commonEmailProps(),
		to: recipient,
		subject: 'A look back at your gifts',
		react: <PostBirthdayEmail items={items} />,
	})
	logSendResult('post-birthday', recipient, res as SendResult)
	return res
}

export const sendTestEmail = async () => {
	const client = getResendClient()
	if (!client || !env.RESEND_FROM_EMAIL) {
		throw new Error('Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.')
	}

	const to = env.RESEND_BCC_ADDRESS || env.RESEND_FROM_EMAIL
	if (!to) {
		throw new Error('No email address configured for test email')
	}

	emailLog.info({ kind: 'test', recipient: to }, 'sending email')
	const res = await client.emails.send({
		from: getFromEmail(),
		to,
		subject: 'Test Email',
		react: <TestEmail />,
	})
	logSendResult('test', to, res as SendResult)
	return res
}
