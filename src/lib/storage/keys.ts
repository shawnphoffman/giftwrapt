import { customAlphabet } from 'nanoid'

// URL-safe, no dashes or underscores to keep object keys cleanly parseable and
// easy to read in logs. Alphabet is ~62^N bits of entropy per char; 8 chars is
// enough for avatars (collision near-impossible within a single user), 10 for
// items.
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const avatarNonce = customAlphabet(alphabet, 8)
const itemNonce = customAlphabet(alphabet, 10)

export const avatarKey = (userId: string): string => `avatars/${userId}-${avatarNonce()}.webp`

export const itemImageKey = (itemId: number | string): string => `items/${itemId}/${itemNonce()}.webp`

// Reverse mapping: given a URL the app previously handed out (either
// `${STORAGE_PUBLIC_URL}/<key>` or `/api/files/<key>`), recover the raw key
// so we can call storage.delete(). Returns null for URLs we didn't mint
// (e.g. legacy V1 hotlinks) - callers should skip deletion in that case.
export function parseKeyFromUrl(url: string, publicUrlBase: string | undefined): string | null {
	if (!url) return null
	try {
		// Proxy route first: `/api/files/<key>`. This can arrive as an
		// absolute URL (when STORAGE_PUBLIC_URL was unset at write time and we
		// stored `${SERVER_URL}/api/files/<key>`) or as a root-relative path.
		const proxyMatch = /\/api\/files\/(.+)$/.exec(url)
		if (proxyMatch?.[1]) return decodeURIComponent(proxyMatch[1])

		// Direct CDN URL: strip `publicUrlBase` prefix. Tolerate trailing slash
		// on the base.
		if (publicUrlBase) {
			const base = publicUrlBase.replace(/\/$/, '')
			if (url.startsWith(base + '/')) {
				return decodeURIComponent(url.slice(base.length + 1))
			}
		}
	} catch {
		// fall through to null
	}
	return null
}
