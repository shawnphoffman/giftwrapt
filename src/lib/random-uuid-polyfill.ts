// crypto.randomUUID is only exposed in secure contexts (HTTPS or localhost).
// Self-hosters who reach the app via http://<lan-ip>:port have no secure
// context, and several deps (notably @tanstack/db) call randomUUID at
// module-eval / collection-construction time, which crashes boot.
//
// crypto.getRandomValues IS available in non-secure contexts, so we can fill
// in randomUUID with an RFC 4122 v4 implementation built on top of it.
//
// This file is import-for-side-effects; pull it in once before anything that
// might touch crypto.randomUUID.
if (
	typeof globalThis !== 'undefined' &&
	globalThis.crypto &&
	typeof globalThis.crypto.randomUUID !== 'function' &&
	typeof globalThis.crypto.getRandomValues === 'function'
) {
	globalThis.crypto.randomUUID = function randomUUID() {
		const bytes = new Uint8Array(16)
		globalThis.crypto.getRandomValues(bytes)
		bytes[6] = (bytes[6] & 0x0f) | 0x40
		bytes[8] = (bytes[8] & 0x3f) | 0x80
		const hex: Array<string> = []
		for (const byte of bytes) hex.push(byte.toString(16).padStart(2, '0'))
		return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
	}
}
