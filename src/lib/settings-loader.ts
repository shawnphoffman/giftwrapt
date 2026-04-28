// Server-only. Do not import from client/route components.
//
// I/O layer for `app_settings`. Owns both halves of the encryption-at-rest
// boundary for `scrapeProviders` entries:
//
//   - getAppSettings(db): reads JSONB rows, walks the secret-field paths
//     defined in SCRAPE_PROVIDER_SECRET_FIELDS, decrypts envelopes to
//     plaintext strings, then runs the (browser-safe) Zod schema parse.
//   - encryptScrapeProviderSecrets(providers): the inverse — walks the
//     same paths and encrypts plaintext to envelopes before upsert.
//
// Keeping this module separate from `settings.ts` is what lets that
// module stay browser-safe (the schema uses plain `z.string()` for secret
// fields and never imports `node:crypto`).

import type { Database } from '@/db'
import { decryptAppSecret, encryptAppSecret } from '@/lib/crypto/app-secret'
import {
	type AppSettings,
	appSettingsSchema,
	DEFAULT_APP_SETTINGS,
	loadRawSettings,
	looksLikeEncryptedEnvelope,
	SCRAPE_PROVIDER_SECRET_FIELDS,
} from '@/lib/settings'

// Decrypt envelopes inside the raw `scrapeProviders` JSONB row before
// schema parse. Mutates a deep clone of the array; rows with malformed
// envelopes (e.g. wrong key) are dropped silently so a corrupted secret
// can't take the whole settings load down.
function decryptScrapeProviderSecrets(raw: unknown): unknown {
	if (!Array.isArray(raw)) return raw
	return raw
		.map(entry => {
			if (!entry || typeof entry !== 'object') return entry
			const e = entry as Record<string, unknown>
			const rawType = e.type
			if (typeof rawType !== 'string') return entry
			// Migrate legacy discriminator from the GiftWrapt rename (commit
			// e581a3d). Encrypted envelope shape is unchanged, so existing
			// ciphertext stays valid.
			const type = rawType === 'wish-list-scraper' ? 'giftwrapt-scraper' : rawType
			const secretFields = (SCRAPE_PROVIDER_SECRET_FIELDS as Partial<Record<string, ReadonlyArray<string>>>)[type]
			const out: Record<string, unknown> = { ...e, type }
			if (!secretFields || secretFields.length === 0) return out
			for (const field of secretFields) {
				const value = e[field]
				if (looksLikeEncryptedEnvelope(value)) {
					try {
						out[field] = decryptAppSecret(value as Parameters<typeof decryptAppSecret>[0])
					} catch {
						// Drop the field rather than the entry; a bad ciphertext
						// effectively means "not configured" for this entry.
						delete out[field]
					}
				}
			}
			return out
		})
		.filter(entry => entry !== null)
}

export async function getAppSettings(db: Database): Promise<AppSettings> {
	const raw = await loadRawSettings(db)

	// Pre-process: decrypt any encrypted secret fields in
	// `scrapeProviders` so the Zod schema sees only plaintext.
	const merged: Record<string, unknown> = {
		...DEFAULT_APP_SETTINGS,
		...raw,
	}
	if ('scrapeProviders' in merged) {
		merged.scrapeProviders = decryptScrapeProviderSecrets(merged.scrapeProviders)
	}

	return appSettingsSchema.parse(merged)
}

// Walks the array and replaces each declared secret field with an
// EncryptedEnvelope. Output type is `unknown` because the encrypted
// shape isn't the schema's transform-output shape; callers feed this
// directly to `db.insert(appSettings).values({ key, value: encrypted })`.
export function encryptScrapeProviderSecrets(providers: AppSettings['scrapeProviders']): Array<unknown> {
	return providers.map(entry => {
		const secretFields = SCRAPE_PROVIDER_SECRET_FIELDS[entry.type]
		if (secretFields.length === 0) return entry
		const out: Record<string, unknown> = { ...entry }
		for (const field of secretFields) {
			const value = (entry as Record<string, unknown>)[field]
			if (typeof value === 'string' && value.length > 0) {
				out[field] = encryptAppSecret(value)
			}
		}
		return out
	})
}
