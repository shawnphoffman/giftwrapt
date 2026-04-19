import { Resend } from 'resend'

import BirthdayEmail from '@/emails/happy-birthday-email'
import NewCommentEmail from '@/emails/new-comment-email'
import PostBirthdayEmail from '@/emails/post-birthday-email'
import TestEmail from '@/emails/test-email'
import { env } from '@/env'

export const resendClient = new Resend(env.RESEND_API_KEY)

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

export const sendNewCommentEmail = async (
	username: string,
	recipient: string,
	commenter: string,
	comment: string,
	itemTitle: string,
	listId: number,
	itemId: number
) => {
	const emailResp = await resendClient.emails.send({
		...commonEmailProps(),
		to: recipient,
		subject: 'New Comment on Wish Lists',
		react: (
			<NewCommentEmail username={username} commenter={commenter} comment={comment} itemTitle={itemTitle} listId={listId} itemId={itemId} />
		),
	})
	return emailResp
}

export const sendBirthdayEmail = async (name: string, recipient: string) => {
	const emailResp = await resendClient.emails.send({
		...commonEmailProps(),
		to: recipient,
		subject: `🎉 Happy Birthday, ${name}!`,
		react: <BirthdayEmail name={name} />,
	})
	return emailResp
}

export const sendPostBirthdayEmail = async (
	recipient: string,
	items: Array<{ title: string; image_url: string; gifters: string }>
) => {
	const emailResp = await resendClient.emails.send({
		...commonEmailProps(),
		to: recipient,
		subject: 'A look back at your gifts',
		react: <PostBirthdayEmail items={items} />,
	})
	return emailResp
}

export const sendTestEmail = async () => {
	const to = env.RESEND_BCC_ADDRESS || env.RESEND_FROM_EMAIL
	if (!to) {
		throw new Error('No email address configured for test email')
	}

	const emailResp = await resendClient.emails.send({
		from: getFromEmail(),
		to,
		subject: 'Test Email',
		react: <TestEmail />,
	})
	return emailResp
}
