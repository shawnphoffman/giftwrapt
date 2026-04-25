import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { AI_SETTING_KEYS, type AiSettingKey, envLockedFlags, type FieldSource, resolveAiConfig } from '@/lib/ai-config'
import { encryptAppSecret } from '@/lib/crypto/app-secret'
import { createLogger } from '@/lib/logger'
import { adminAuthMiddleware } from '@/middleware/auth'

const adminAiLog = createLogger('admin:ai')

export type AiConfigResponse = {
	baseUrl: { source: FieldSource; value?: string }
	apiKey: { source: FieldSource; preview?: string }
	model: { source: FieldSource; value?: string }
	envLocked: { baseUrl: boolean; apiKey: boolean; model: boolean }
	isValid: boolean
}

function apiKeyPreview(value: string): string {
	const last4 = value.slice(-4)
	const prefix = value.startsWith('sk-') ? 'sk-' : ''
	return `${prefix}••••${last4}`
}

export const fetchAiConfigAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<AiConfigResponse> => {
		const cfg = await resolveAiConfig(db)
		return {
			baseUrl: { source: cfg.baseUrl.source, value: cfg.baseUrl.value },
			apiKey: {
				source: cfg.apiKey.source,
				preview: cfg.apiKey.value ? apiKeyPreview(cfg.apiKey.value) : undefined,
			},
			model: { source: cfg.model.source, value: cfg.model.value },
			envLocked: envLockedFlags(),
			isValid: cfg.isValid,
		}
	})

const updateInputSchema = z
	.object({
		baseUrl: z.union([z.url(), z.null()]).optional(),
		apiKey: z.union([z.string().min(1), z.null()]).optional(),
		model: z.union([z.string().min(1), z.null()]).optional(),
	})
	.strict()

type UpdateInput = z.infer<typeof updateInputSchema>

export type UpdateAiConfigResult = { ok: true } | { ok: false; error: string }

async function upsertSetting(key: AiSettingKey, value: unknown) {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
		target: appSettings.key,
		set: { value },
	})
}

async function deleteSetting(key: AiSettingKey) {
	await db.delete(appSettings).where(eq(appSettings.key, key))
}

export const updateAiConfigAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: UpdateInput) => updateInputSchema.parse(data))
	.handler(async ({ data }): Promise<UpdateAiConfigResult> => {
		const locks = envLockedFlags()

		const envRejections: Array<string> = []
		if (data.baseUrl !== undefined && locks.baseUrl) envRejections.push('baseUrl')
		if (data.apiKey !== undefined && locks.apiKey) envRejections.push('apiKey')
		if (data.model !== undefined && locks.model) envRejections.push('model')
		if (envRejections.length > 0) {
			return {
				ok: false,
				error: `The following fields are set by environment variables and cannot be changed here: ${envRejections.join(', ')}.`,
			}
		}

		if (data.baseUrl !== undefined) {
			if (data.baseUrl === null) await deleteSetting(AI_SETTING_KEYS.baseUrl)
			else await upsertSetting(AI_SETTING_KEYS.baseUrl, data.baseUrl)
		}
		if (data.apiKey !== undefined) {
			if (data.apiKey === null) {
				await deleteSetting(AI_SETTING_KEYS.apiKey)
			} else {
				await upsertSetting(AI_SETTING_KEYS.apiKey, encryptAppSecret(data.apiKey))
			}
		}
		if (data.model !== undefined) {
			if (data.model === null) await deleteSetting(AI_SETTING_KEYS.model)
			else await upsertSetting(AI_SETTING_KEYS.model, data.model)
		}

		adminAiLog.info({ changedKeys: Object.keys(data) }, 'ai config updated')
		return { ok: true }
	})

const testInputSchema = z
	.object({
		// Optional draft overrides. Any field not provided falls back to the
		// currently-saved value (env or db).
		baseUrl: z.url().optional(),
		apiKey: z.string().min(1).optional(),
		model: z.string().min(1).optional(),
	})
	.strict()

export type TestAiConnectionResult = { ok: true; latencyMs: number } | { ok: false; error: string }

function joinUrl(base: string, path: string): string {
	return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export const testAiConnectionAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: z.infer<typeof testInputSchema>) => testInputSchema.parse(data))
	.handler(async ({ data }): Promise<TestAiConnectionResult> => {
		const cfg = await resolveAiConfig(db)
		const baseUrl = data.baseUrl ?? cfg.baseUrl.value
		const apiKey = data.apiKey ?? cfg.apiKey.value
		const model = data.model ?? cfg.model.value

		if (!baseUrl) return { ok: false, error: 'Base URL is required.' }
		if (!apiKey) return { ok: false, error: 'API key is required.' }
		if (!model) return { ok: false, error: 'Model is required.' }

		// Tiny chat-completions call: validates baseUrl, apiKey, and model in
		// one round-trip. max_tokens=1 keeps cost negligible.
		const url = joinUrl(baseUrl, 'chat/completions')
		const started = Date.now()

		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model,
					messages: [{ role: 'user', content: 'ping' }],
					max_tokens: 1,
				}),
			})

			const latencyMs = Date.now() - started

			if (res.ok) {
				return { ok: true, latencyMs }
			}

			let detail = `${res.status} ${res.statusText}`.trim()
			try {
				const body = (await res.json()) as { error?: { message?: string } | string }
				const msg = typeof body.error === 'string' ? body.error : body.error?.message
				if (msg) detail = msg
			} catch {
				// Response wasn't JSON; fall back to status text.
			}
			adminAiLog.warn({ status: res.status, detail }, 'ai connection test failed')
			return { ok: false, error: detail }
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to reach AI provider.'
			adminAiLog.error({ err }, 'ai connection test threw')
			return { ok: false, error: msg }
		}
	})
