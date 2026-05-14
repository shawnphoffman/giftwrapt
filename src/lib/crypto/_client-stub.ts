// Client-side stub for `@/lib/crypto/app-secret`. Aliased in by Vite when
// building for the browser environment so the client bundle never tries to
// parse `node:crypto` (which Vite can't resolve in the browser).
//
// app-secret's actual functions only run server-side - decryption happens
// inside server-fn handlers and cron paths. Any client code that reaches
// for an export here at runtime is a bug; the throwing accessors below
// surface it loudly instead of silently no-oping.
//
// Type-only imports erase before reaching this stub, so existing call
// sites that only need the type signature continue to compile.

// Mirror the real module's exported envelope type so client code that
// imports it for type-only use keeps compiling.
export type EncryptedEnvelope = {
	v: 1
	iv: string
	tag: string
	data: string
}

function fail(prop: string): never {
	throw new Error(
		`@/lib/crypto/app-secret is server-only; tried to access "${prop}" from a client bundle. This is a bug - the helper only runs in server-fn handlers / cron / Hono routes.`
	)
}

export function encryptAppSecret(_plaintext: string): EncryptedEnvelope {
	return fail('encryptAppSecret')
}

export function decryptAppSecret(_envelope: EncryptedEnvelope): string {
	return fail('decryptAppSecret')
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
	// Cheap shape check is safe to evaluate client-side; matches the
	// implementation in `@/lib/settings.ts#looksLikeEncryptedEnvelope`.
	if (!value || typeof value !== 'object') return false
	const v = value as Record<string, unknown>
	return v.v === 1 && typeof v.iv === 'string' && typeof v.tag === 'string' && typeof v.data === 'string'
}
