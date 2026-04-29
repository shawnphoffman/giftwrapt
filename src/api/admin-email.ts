import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { Resend } from 'resend'
import { z } from 'zod'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { encryptAppSecret } from '@/lib/crypto/app-secret'
import { EMAIL_SETTING_KEYS, type EmailSettingKey, envLockedFlags, type FieldSource, resolveEmailConfig } from '@/lib/email-config'
import { createLogger } from '@/lib/logger'
import { LIMITS } from '@/lib/validation/limits'
import { adminAuthMiddleware } from '@/middleware/auth'

const adminEmailLog = createLogger('admin:email')

export type EmailConfigResponse = {
	apiKey: { source: FieldSource; preview?: string }
	fromEmail: { source: FieldSource; value?: string }
	fromName: { source: FieldSource; value?: string }
	bccAddress: { source: FieldSource; value?: string }
	envLocked: { apiKey: boolean; fromEmail: boolean; fromName: boolean; bccAddress: boolean }
	isValid: boolean
}

function apiKeyPreview(value: string): string {
	// Resend keys look like "re_xxxxxxxxxxxx". Show the prefix + last 4.
	const last4 = value.slice(-4)
	const prefix = value.startsWith('re_') ? 're_' : ''
	return `${prefix}••••${last4}`
}

export const fetchEmailConfigAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<EmailConfigResponse> => {
		const cfg = await resolveEmailConfig(db)
		return {
			apiKey: {
				source: cfg.apiKey.source,
				preview: cfg.apiKey.value ? apiKeyPreview(cfg.apiKey.value) : undefined,
			},
			fromEmail: { source: cfg.fromEmail.source, value: cfg.fromEmail.value },
			fromName: { source: cfg.fromName.source, value: cfg.fromName.value },
			bccAddress: { source: cfg.bccAddress.source, value: cfg.bccAddress.value },
			envLocked: envLockedFlags(),
			isValid: cfg.isValid,
		}
	})

const updateInputSchema = z
	.object({
		apiKey: z.union([z.string().min(1).max(LIMITS.SECRET), z.null()]).optional(),
		fromEmail: z.union([z.email().max(LIMITS.EMAIL), z.null()]).optional(),
		fromName: z.union([z.string().min(1).max(LIMITS.SHORT_NAME), z.null()]).optional(),
		bccAddress: z.union([z.email().max(LIMITS.EMAIL), z.null()]).optional(),
	})
	.strict()

type UpdateInput = z.infer<typeof updateInputSchema>

export type UpdateEmailConfigResult = { ok: true } | { ok: false; error: string }

async function upsertSetting(key: EmailSettingKey, value: unknown) {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
		target: appSettings.key,
		set: { value },
	})
}

async function deleteSetting(key: EmailSettingKey) {
	await db.delete(appSettings).where(eq(appSettings.key, key))
}

export const updateEmailConfigAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: UpdateInput) => updateInputSchema.parse(data))
	.handler(async ({ data }): Promise<UpdateEmailConfigResult> => {
		const locks = envLockedFlags()

		// Reject any field that env already controls.
		const envRejections: Array<string> = []
		if (data.apiKey !== undefined && locks.apiKey) envRejections.push('apiKey')
		if (data.fromEmail !== undefined && locks.fromEmail) envRejections.push('fromEmail')
		if (data.fromName !== undefined && locks.fromName) envRejections.push('fromName')
		if (data.bccAddress !== undefined && locks.bccAddress) envRejections.push('bccAddress')
		if (envRejections.length > 0) {
			return {
				ok: false,
				error: `The following fields are set by environment variables and cannot be changed here: ${envRejections.join(', ')}.`,
			}
		}

		if (data.apiKey !== undefined) {
			if (data.apiKey === null) {
				await deleteSetting(EMAIL_SETTING_KEYS.apiKey)
			} else {
				await upsertSetting(EMAIL_SETTING_KEYS.apiKey, encryptAppSecret(data.apiKey))
			}
		}
		if (data.fromEmail !== undefined) {
			if (data.fromEmail === null) await deleteSetting(EMAIL_SETTING_KEYS.fromEmail)
			else await upsertSetting(EMAIL_SETTING_KEYS.fromEmail, data.fromEmail)
		}
		if (data.fromName !== undefined) {
			if (data.fromName === null) await deleteSetting(EMAIL_SETTING_KEYS.fromName)
			else await upsertSetting(EMAIL_SETTING_KEYS.fromName, data.fromName)
		}
		if (data.bccAddress !== undefined) {
			if (data.bccAddress === null) await deleteSetting(EMAIL_SETTING_KEYS.bccAddress)
			else await upsertSetting(EMAIL_SETTING_KEYS.bccAddress, data.bccAddress)
		}

		adminEmailLog.info({ changedKeys: Object.keys(data) }, 'email config updated')
		return { ok: true }
	})

const testInputSchema = z
	.object({
		apiKey: z.string().min(1).max(LIMITS.SECRET).optional(),
	})
	.strict()

export type TestResendKeyResult = { ok: true } | { ok: false; error: string }

export const testResendApiKeyAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: z.infer<typeof testInputSchema>) => testInputSchema.parse(data))
	.handler(async ({ data }): Promise<TestResendKeyResult> => {
		let key = data.apiKey
		if (!key) {
			const cfg = await resolveEmailConfig(db)
			key = cfg.apiKey.value
		}
		if (!key) {
			return { ok: false, error: 'No API key to test. Provide one or save one first.' }
		}

		try {
			const client = new Resend(key)
			const res = await client.apiKeys.list()
			if (res.error) {
				const msg = typeof res.error === 'object' && 'message' in res.error ? String(res.error.message) : 'Resend rejected the key.'
				adminEmailLog.warn({ err: res.error }, 'resend key test failed')
				return { ok: false, error: msg }
			}
			return { ok: true }
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to reach Resend.'
			adminEmailLog.error({ err }, 'resend key test threw')
			return { ok: false, error: msg }
		}
	})
