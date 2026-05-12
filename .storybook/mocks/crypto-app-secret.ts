// Aliased in place of `@/lib/crypto/app-secret` for Storybook.
//
// The real module imports `node:crypto` at the top level (specifically
// `scryptSync`, which Vite externalizes to a browser stub that doesn't
// export it). Stories never read or write encrypted settings, so the
// exports just need to exist as no-ops.

export type EncryptedEnvelope = { v: 1; iv: string; tag: string; data: string }

export function encryptAppSecret(_plaintext: string): EncryptedEnvelope {
	return { v: 1, iv: '', tag: '', data: '' }
}

export function decryptAppSecret(_envelope: EncryptedEnvelope): string {
	return ''
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
	return typeof value === 'object' && value !== null && (value as { v?: unknown }).v === 1
}
