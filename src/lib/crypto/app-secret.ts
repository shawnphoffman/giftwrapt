import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

import { env } from '@/env'

// Envelope format for values encrypted with the app-secret key. Stored as
// JSONB in app_settings. v=1 lets us rotate the scheme later without breaking
// existing rows.
export type EncryptedEnvelope = {
	v: 1
	iv: string
	tag: string
	data: string
}

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16
// Fixed salt is fine: BETTER_AUTH_SECRET is the actual secret; the salt's
// only job is to domain-separate this derived key from other uses of the
// same master secret.
const KEY_SALT = 'wish-lists:app-secret:v1'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
	if (cachedKey) return cachedKey
	cachedKey = scryptSync(env.BETTER_AUTH_SECRET, KEY_SALT, KEY_LEN)
	return cachedKey
}

export function encryptAppSecret(plaintext: string): EncryptedEnvelope {
	const iv = randomBytes(IV_LEN)
	const cipher = createCipheriv(ALGO, getKey(), iv, { authTagLength: TAG_LEN })
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
	const tag = cipher.getAuthTag()
	return {
		v: 1,
		iv: iv.toString('hex'),
		tag: tag.toString('hex'),
		data: ciphertext.toString('hex'),
	}
}

export function decryptAppSecret(envelope: EncryptedEnvelope): string {
	const iv = Buffer.from(envelope.iv, 'hex')
	const tag = Buffer.from(envelope.tag, 'hex')
	const ciphertext = Buffer.from(envelope.data, 'hex')
	const decipher = createDecipheriv(ALGO, getKey(), iv, { authTagLength: TAG_LEN })
	decipher.setAuthTag(tag)
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
	return plaintext.toString('utf8')
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
	if (!value || typeof value !== 'object') return false
	const v = value as Record<string, unknown>
	return v.v === 1 && typeof v.iv === 'string' && typeof v.tag === 'string' && typeof v.data === 'string'
}
